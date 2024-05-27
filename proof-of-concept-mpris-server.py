#!/bin/python3
import dbus, json, http.server
from threading import Lock

PORT = 6969

# Information dictionaries
#old_info = {"title": None, "artist": None, "art_url": None}
info = dict()
#info_lock = Lock();

# Connect to DBus session bus and grab the correct interface
session_bus = dbus.SessionBus()
media_player = session_bus.get_object("org.mpris.MediaPlayer2.plasma-browser-integration", "/org/mpris/MediaPlayer2")
interface = dbus.Interface(media_player, "org.freedesktop.DBus.Properties")

# Handles HTTP requests
class RequestHandler(http.server.BaseHTTPRequestHandler):
  def do_GET(self):
    # Request is for one of the code files
    if self.path == "/script.js" or self.path == "/ui.html" or self.path == "/style.css":
      self.send_response(200)
      if self.path == "/script.js":
        self.send_header("Content-Type", "application/javascript")
      elif self.path == "/ui.html":
        self.send_header("Content-Type", "text/html")
      elif self.path == "/style.css":
        self.send_header("Content-Type", "text/css")
      self.end_headers()

      with open(self.path[1:], "rb") as f:
        self.wfile.write(f.read())

    # Request is for song data
    elif self.path == "/get-song-info":
    #with info_lock:
      metadata = interface.Get("org.mpris.MediaPlayer2.Player", "Metadata")
      info["title"] = str(metadata.get("xesam:title"))
      artist_list = metadata.get("xesam:artist")
      info["artist"] = ""
      info["art_url"] = str(metadata.get("mpris:artUrl"))

      if artist_list == None:
        if info["title"].find("Heartbound OST") != -1:
          info["artist"] = "Pirate Software"
      else:
        for i in artist_list:
          if len(info["artist"]) != 0:
            info["artist"] += ", "
          info["artist"] += str(i)

      json_encoded = json.dumps(info)
      print("Title:", info["title"])
      print("Artist:", info["artist"])
      print("Album art URL:", info["art_url"])
      print("JSON encoded: ", json_encoded)

      self.send_response(200)
      self.send_header("Content-Type", "text/json")
      self.end_headers()
      self.wfile.write(json_encoded.encode("utf-8"))

    # Request is invalid
    else:
      self.send_response(404)
      self.end_headers()


with http.server.HTTPServer(('127.0.0.1', PORT), RequestHandler) as server:
  print("Listening at", PORT)
  server.serve_forever()
