#!/bin/python3
import dbus, json, http.server, mimetypes, time, threading, os, requests
from threading import Condition

PORT = 6969
REQUEST_TIMEOUT = 20  # seconds
POLLING_INTERVAL = 0.5  # seconds

# NOTE: Some variables are stored as arrays to work around problems with accessing variables from other threads

# Song info
info = {"title": "", "artist": "", "playing": False, "timestamp": "0", "song_changed": True}
info_lock = Condition();
artwork = [b"", ""]

# State
timestamp_song = [0]
timestamp_playback = [0]
stopping = False

# Connect to DBus session bus and grab the correct interface
session_bus = dbus.SessionBus()
media_player = session_bus.get_object("org.mpris.MediaPlayer2.plasma-browser-integration", "/org/mpris/MediaPlayer2")
interface = dbus.Interface(media_player, "org.freedesktop.DBus.Properties")

# Handles HTTP requests
class RequestHandler(http.server.BaseHTTPRequestHandler):
  def do_GET(self):
    # Request is for one of the code files
    if self.path == "/script.js" or self.path == "/ui.html" or self.path == "/style.css":
      # Make sure the file exists
      if os.path.exists(self.path[1:]):
        self.send_response(200)                                                       # Response: 200 OK
        self.send_header("Access-Control-Allow-Origin", "http://localhost"+str(PORT)) # Deny other sites from snooping on our code
        self.send_header("Content-Type", mimetypes.guess_type(self.path)[0])          # Figure out what file type we're sending
        self.end_headers()

        with open(self.path[1:], "rb") as f:
          self.wfile.write(f.read())

      # 404 Not Found if the file doesn't exist
      else:
        self.send_response(404)
        self.end_headers()

    # Request is for song data
    elif self.path == "/get-song-info" or self.path[:15] == "/get-song-info?":
      # Extract timestamp from URL, if it was specified and it's valid
      timestamp = None
      try:
        # Attempt to parse the timestamp, or ignore it if it's invalid
        timestamp = int(self.path[15:])
      except:
        pass

      json_encoded = None
      with info_lock:
        if timestamp != timestamp_playback[0] or info_lock.wait(timeout=REQUEST_TIMEOUT):
          # Check what changed since timestamp
          info["song_changed"] = timestamp == None or timestamp < timestamp_song[0]
          # Encode data to JSON
          json_encoded = json.dumps(info)

      # Send response
      if json_encoded == None:  # Song hasn't changed
        self.send_response(304)                                                         # Response: 304 Not Modified
        self.send_header("Access-Control-Allow-Origin", "http://localhost:"+str(PORT))  # Deny other sites from snooping on our music
        self.send_header("Content-Type", "text/json")                                   # We're sending JSON
        self.end_headers()
      else:                     # Song has changed
        self.send_response(200)                                                         # Response: 200 OK
        self.send_header("Access-Control-Allow-Origin", "http://localhost:"+str(PORT))  # Deny other sites from snooping on our music
        self.send_header("Content-Type", "text/json")                                   # We're sending JSON
        self.end_headers()
        self.wfile.write(json_encoded.encode("utf-8"))

    # Request is for song artwork
    elif self.path == "/get-song-artwork":
      response_image = None
      response_mimetype = None
      # Grab artwork
      with info_lock:
        response_image = artwork[0]
        response_mimetype = artwork[1]
      # Send data back to client
      self.send_response(200)                                                         # Response: 200 OK
      self.send_header("Access-Control-Allow-Origin", "http://localhost:"+str(PORT))  # Deny other sites from snooping on our music
      self.send_header("Content-Type", response_mimetype)                             # Image format we're sending
      self.end_headers()
      self.wfile.write(response_image)


    # Request is invalid
    else:
      self.send_response(404)
      self.send_header("Access-Control-Allow-Origin", "http://localhost:"+str(PORT)) # Deny other sites from snooping on our stuff
      self.end_headers()


# Watches MPRIS for new data
def mprisWatcher():
  while not stopping:
    # Grab metadata from DBus
    metadata = interface.Get("org.mpris.MediaPlayer2.Player", "Metadata")
    new_playback_state = str(interface.Get("org.mpris.MediaPlayer2.Player", "PlaybackStatus")) == 'Playing'

    # Parse metadata
    new_title = ""
    new_artist = ""
    art_url = ""
    # Anything not set becomes an empty string
    if metadata.get("xesam:title") != None:
      new_title = str(metadata.get("xesam:title"))
    if metadata.get("mpris:artUrl") != None:
      art_url = str(metadata.get("mpris:artUrl"))
    artist_list = metadata.get("xesam:artist")
    # Concatenate all artists into one string
    if artist_list != None:
      for i in artist_list:
        if len(new_artist) != 0:
          new_artist += ", "
        new_artist += str(i)

    # Check if song info or playback state have changed
    with info_lock:
      if new_title != info["title"] or \
        new_artist != info["artist"]:
            # When it changes, update it with the new info
            info["title"] = new_title
            info["artist"] = new_artist
            info["playing"] = new_playback_state
            timestamp = time.time_ns()
            timestamp_song[0] = timestamp
            timestamp_playback[0] = timestamp
            info["timestamp"] = str(timestamp)
            # NOTE: Timestamp is stored as a string, due to client's JS int limitations
            # Print new info to console
            print()
            print("Title:", info["title"])
            print("Artist:", info["artist"])
            print("Album art URL:", art_url)
            print()
            # Download new artwork (if it exists)
            if (art_url == ""):
              artwork[0], artwork[1] = [b"", ""]
            else:
              artwork[0], artwork[1] = getImage(art_url)
            # Wake up HTTP threads waiting
            info_lock.notify_all()

      elif new_playback_state != info["playing"]:
        # Same song, but playback state changed
        info["playing"] = new_playback_state
        timestamp = time.time_ns()
        timestamp_playback[0] = timestamp
        info["timestamp"] = str(timestamp)
        print("Playing:", new_playback_state)
        # Wake up HTTP threads waiting
        info_lock.notify_all()

    # Wait 0.5s before continuing
    time.sleep(POLLING_INTERVAL)

# Reads or downloads an image and returns tuple with binary data and mime type
def getImage(uri):
  # Determine URI protocol
  if uri[:7] == "http://" or uri[:8] == "https://":
    # HTTP/HTTPS
    response = requests.get(uri)
    if (response.status_code == 200):
      # Successful request, returns data and mime type
      return [response.content, response.headers['Content-Type']]
    else:
      # Error, returns empty data
      return [b"", ""]

  elif uri[:7] == "file://":
    # Local file
    data = None
    try:
      with open(uri[7:], "rb") as f:
        data = f.read()
    except:
      # Return blank data on error
      return [b"", ""]
    # Otherwise, return data and guessed mime type
    return [data, mimetypes.guess_type(uri)]

  else:
    # Return blank data on unrecognized protocol
    return [b"", ""]

# Main
if __name__ == "__main__":
  # Start info watcher thread
  watcher = threading.Thread(target=mprisWatcher)
  watcher.start()

  # Start HTTP server
  try:
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), RequestHandler) as server:
      print("Listening at", PORT)
      server.serve_forever()
  except KeyboardInterrupt:
    pass

  # Signal the watcher thread to stop
  print("Stopping")
  stopping = True
