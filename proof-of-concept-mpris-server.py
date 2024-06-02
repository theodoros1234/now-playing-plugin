#!/bin/python3
import dbus, json, http.server, mimetypes, time, threading, os
from threading import Condition

PORT = 6969
REQUEST_TIMEOUT = 20  # seconds
POLLING_INTERVAL = 1  # seconds

# Information dictionaries
info = {"title": "", "artist": "", "art_url": "", "timestamp": "0"}
info_lock = Condition();

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
        self.send_response(200)                                                   # Response: 200 OK
        self.send_header("Access-Control-Allow-Origin", "http://localhost"+str(PORT)) # Deny other sites from snooping on our code
        self.send_header("Content-Type", mimetypes.guess_type(self.path)[0])         # Figure out what file type we're sending
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
        # Make sure the timestamp is a valid integer, but convert it back to a string afterwards.
        # We're using a string due to the client's JS integer limitations.
        timestamp = str(int(self.path[15:]))
      except:
        pass

      json_encoded = None
      with info_lock:
        if timestamp != info["timestamp"] or info_lock.wait(timeout=REQUEST_TIMEOUT):
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

    # Parse metadata
    new_title = ""
    new_artist = ""
    new_art_url = ""
    # Anything not set becomes an empty string
    if metadata.get("xesam:title") != None:
      new_title = str(metadata.get("xesam:title"))
    if metadata.get("mpris:artUrl") != None:
      new_art_url = str(metadata.get("mpris:artUrl"))
    artist_list = metadata.get("xesam:artist")
    # Concatenate all artists into one string
    if artist_list != None:
      for i in artist_list:
        if len(new_artist) != 0:
          new_artist += ", "
        new_artist += str(i)

    # Check if song info has changed
    with info_lock:
      if new_title != info["title"] or \
        new_artist != info["artist"] or \
        new_art_url != info["art_url"]:
            # When it changes, update it with the new info
            info["title"] = new_title
            info["artist"] = new_artist
            info["art_url"] = new_art_url
            info["timestamp"] = str(time.time_ns())
            # NOTE: Timestamp is stored as a string, due to client's JS int limitations
            # Print new info to console
            print()
            print("Title:", info["title"])
            print("Artist:", info["artist"])
            print("Album art URL:", info["art_url"])
            print()
            # Wake up HTTP threads waiting
            info_lock.notify_all()

    # Wait 1s before continuing
    time.sleep(POLLING_INTERVAL)


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
    print("Received keyboard interrupt")

  # Signal the watcher thread to stop
  print("Stopping")
  stopping = True
