const PORT = 6969;

// HTML elements and related data
const css_root = document.querySelector(":root");
var col_right;
var text_size;
// Song metadata
var title="", artist="", art="", timestamp=null;
// Other objects
var http_handler = new XMLHttpRequest, img_preloader = new XMLHttpRequest;
http_handler.onerror = function() {
  console.warn("Connection error, reconnecting in 5 seconds.");
  setTimeout(getSongInfo, 5000);
};
img_preloader.onload = updateSongInfo;
img_preloader.onerror = updateSongInfo;
img_preloader.responseType = "blob";

// Adjusts text size on window resize
function adjustTextSize() {
  text_size = col_right.clientHeight * 0.35;
  css_root.style.setProperty('--text-size', text_size+"px");
}

// Initializes stuff when the page finishes loading
function init() {
  col_right = document.getElementsByClassName("col-right")[0];
  window.addEventListener("resize", adjustTextSize);
  adjustTextSize();
  getSongInfo();
}
window.addEventListener("load", init);

// Gets song info from server
function getSongInfo() {
  // Include timestamp if we have it
  if (timestamp === null)
    http_handler.open("GET", "get-song-info");
  else
    http_handler.open("GET", "get-song-info?" + timestamp);
  http_handler.onload = receiveSongInfo;
  http_handler.send();
}

// Processes received song info from server
function receiveSongInfo() {
  switch (this.status) {
    case 200: // New info arrived
      try {
        // Parse JSON data
        data = JSON.parse(this.responseText);
        var old_art=art, old_title=title, old_artist=artist;
        title = data['title'];
        artist = data['artist'];
        art = data['art_url'];
        timestamp = data['timestamp'];

        // Preload album art and update
        img_preloader.open("GET", art);
        img_preloader.send();
      } catch (error) {
        console.error("Could not parse server response, reconnecting in 5 seconds.");
        console.error(error);
        setTimeout(getSongInfo, 5000);
      }
      break;

    case 304: // No new info
      // Check for updated info again
      getSongInfo();
      break;

    default:  // Error or unexpected status
      // Check for updated info again in 5 seconds
      console.error("Server responded with status " + this.status + ", reconnecting in 5 seconds.");
      setTimeout(getSongInfo, 5000);
  }
}

function updateSongInfo() {
  try {
    // Change HTML elements to reflect the new info
    for (let element of document.getElementsByTagName("h1")) {
      element.innerHTML = title;
    }
    for (let element of document.getElementsByTagName("h2")) {
      element.innerHTML = artist;
    }
    for (let element of document.getElementsByClassName("art")) {
      element.style.backgroundImage = 'url("' + URL.createObjectURL(this.response) + '")';
    }
  } catch (error) {
    console.error("Error updating UI.");
    console.error(error);
  }

  // Check for updated info again
  setTimeout(getSongInfo, 250);
}
