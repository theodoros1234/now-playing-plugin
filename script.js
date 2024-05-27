const PORT = 6969;

// HTML elements and related data
const css_root = document.querySelector(":root");
var col_right;
var text_size;
// Song metadata
var title="", artist="", art="";
// Other objects
var http_handler = new XMLHttpRequest, img_preloader = new XMLHttpRequest;
http_handler.onerror = function() {
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
  http_handler.open("GET", "get-song-info");
  http_handler.onload = receiveSongInfo;
  http_handler.send();
}

// Processes received song info from server
function receiveSongInfo() {
  // Parse JSON data
  data = JSON.parse(this.responseText);
  var old_art = art, old_title = title, old_artist = artist;
  title = data['title'];
  artist = data['artist'];
  art = data['art_url'];

  // Preload album art if it changed, or just update song info
  if (old_art == art && old_title == title && old_artist == artist) {
    // Check for updated info again after 1 second
    setTimeout(getSongInfo, 1000);
  } else {
    // Preload and update
    img_preloader.open("GET", art);
    img_preloader.send();
  }
}

function updateSongInfo() {
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

  // Check for updated info again after 1 second
  setTimeout(getSongInfo, 1000);
}
