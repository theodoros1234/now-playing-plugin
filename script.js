const PORT = 6969;

// HTML elements and related data
const css_root = document.querySelector(":root");
var col_right;
var text_size;
// Song metadata
var title="", artist="", art="";
// Other objects
var http_handler = new XMLHttpRequest;
http_handler.onerror = function() {
  setTimeout(getSongInfo, 5000);
};

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
  http_handler.open("GET", "http://localhost:6969/get-song-info")
  http_handler.onload = updateSongInfo;
  http_handler.send();
}

// Processes received song info from server
function updateSongInfo() {
  // Parse JSON data
  data = JSON.parse(http_handler.responseText);
  console.log(data)
  title = data['title']
  artist = data['artist']
  art = data['art_url']

  // Change HTML elements to reflect the new info
  for (let element of document.getElementsByTagName("h1")) {
    element.innerHTML = title;
  }
  for (let element of document.getElementsByTagName("h2")) {
    element.innerHTML = artist;
  }
  for (let element of document.getElementsByClassName("art")) {
    element.style.backgroundImage = 'url("' + art + '")';
  }

  // Check for updated info again after 1 second
  setTimeout(getSongInfo, 1000);
}
