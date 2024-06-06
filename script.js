const PORT = 6969;
const TEXT_SCROLL_PAUSE_TIME = 4000;
const TEXT_SCROLL_SPEED = 1.0;

// HTML elements and related data
const css_root = document.querySelector(":root");
var col_right;
var text_size;

// Song metadata
var title="", artist="", timestamp=null;

// Text scrollers
var title_scroller;
var artist_scroller;

// Other objects
var http_handler = new XMLHttpRequest, img_preloader = new XMLHttpRequest, img_blob = null;
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
  title_scroller = new TextScroller(document.getElementsByClassName('title-container')[0]);
  artist_scroller = new TextScroller(document.getElementsByClassName('artist-container')[0]);
}
window.addEventListener("load", init);

// Cleans up when the page is closed
function cleanup() {
  if (img_blob != null)
    URL.revokeObjectURL(img_blob);
}
window.addEventListener("close", cleanup);

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
        title = data['title'];
        artist = data['artist'];
        timestamp = data['timestamp'];

        // Preload album art and update
        img_preloader.open("GET", "get-song-artwork");
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

// Updates HTML elements to reflect new song info
function updateSongInfo() {
  try {
    // Change HTML elements to reflect the new info
    for (let element of document.getElementsByTagName("h1")) {
      element.textContent = title;
    }
    for (let element of document.getElementsByTagName("h2")) {
      element.textContent = artist;
    }
    for (let element of document.getElementsByClassName("art")) {
      // Create blob from new image, and delete the old one.
      old_img_blob = img_blob;
      img_blob = URL.createObjectURL(this.response);
      element.style.backgroundImage = 'url("' + img_blob + '")';
      if (old_img_blob != null)
        URL.revokeObjectURL(old_img_blob);
    }
    // Update text scrollers
    title_scroller.resetScroll();
    artist_scroller.resetScroll();
  } catch (error) {
    console.error("Error updating UI.");
    console.error(error);
  }

  // Check for updated info again
  setTimeout(getSongInfo, 250);
}

// Handles scrolling text UI elements that don't fit in the viewport
class TextScroller {
  #main = null;
  #scrollback = null;
  #computed_style = null;
  #font_size = null;
  #scroll_width = null;
  #scroll_time = null;
  #needs_scroll = false;
  #currently_scrolling = false;
  #timeout = null;
  pause_time = TEXT_SCROLL_PAUSE_TIME;

  constructor(text_container) {
    // Find main and scrollback elements
    for (var child of text_container.children) {
      if (child.classList.contains("scrollable")) {
        // Main text
        if (child.classList.contains("main"))
          this.#main = child;
        // Scrollback text
        else if (child.classList.contains("scrollback"))
          this.#scrollback = child;
      }
    }

    // Throw error if required elements were not found
    if (this.#main == null)
      throw new Error("Could not find main text element.");
    if (this.#scrollback == null)
      throw new Error("Could not find scrollback text element.");

    // Get computed styles, so we can see the font size
    this.#computed_style = window.getComputedStyle(this.#main);

    // Get notified when elements are resized and when an animation ends
    window.addEventListener("resize", () => this.resizeEvent());
    this.#main.addEventListener("animationend", () => this.animationEnded());

    this.resetScroll();
  }

  resizeEvent() {
    // Get new font size
    this.#font_size = parseFloat(this.#computed_style.getPropertyValue("font-size"));

    // Adjust animation
    this.#scroll_width = this.#main.scrollWidth;
    this.#main.style.setProperty("--scrollback-amount", this.#scroll_width + "px");
    this.#scrollback.style.setProperty("--scrollback-amount", this.#scroll_width + "px");
    this.#scroll_time = (this.#scroll_width + 3 * this.#font_size) / (this.#font_size * TEXT_SCROLL_SPEED);

    // Determine if scrolling is necessary
    this.#needs_scroll = this.#main.scrollWidth > this.#main.clientWidth;

    if (this.#currently_scrolling) {
      if (this.#needs_scroll) {
        // Adjust current scroll
        this.#setScrollAnimation();
      } else {
        // Stop scrolling if we no longer need to scroll
        this.#currently_scrolling = false;
        this.#resetScrollAnimation();
      }
    } else if (this.#needs_scroll && this.#timeout === null) {
      // Enable scrolling again if we need to scroll and it was disabled
      this.animationEnded();
    }
  }

  #setScrollAnimation() {
    this.#main.style.animation = this.#scroll_time + "s linear scroll-main";
    this.#scrollback.style.animation = this.#scroll_time + "s linear scroll-scrollback";
  }

  #resetScrollAnimation() {
    this.#main.style.animation = "";
    this.#scrollback.style.animation = "";
  }

  startScroll() {
    // Forget the timeout that called us
    this.#timeout = null;
    // If scrolling is still necessary, start scrolling
    if (this.#needs_scroll) {
      this.#currently_scrolling = true;
      this.#setScrollAnimation();
    }
  }

  resetScroll() {
    this.#currently_scrolling = false;
    this.#resetScrollAnimation();
    this.resizeEvent();
  }

  animationEnded() {
    this.#currently_scrolling = false;
    this.#resetScrollAnimation();
    // If scrolling is still necessary, pause and then scroll again
    if (this.#needs_scroll)
      this.#timeout = setTimeout(() => this.startScroll(), this.pause_time);
  }
}
