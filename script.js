const PORT = 6969;
const TEXT_SCROLL_PAUSE_TIME = 4000;
const TEXT_SCROLL_SPEED = 1.0;
const TEXT_SCROLL_EDGEMASK_FADE_TIME = "250ms";
const UI_HIDE_TIME = 1000;
const UI_UNHIDE_TIME = 500;
const ON_PAUSE_UI_HIDE_TIMEOUT = 5000;

// HTML elements and related data
const css_root = document.querySelector(":root");
var widget_container;
var col_right;
var text_size;
var ui_shown = true;
var ui_should_be_shown = true;
var ui_animation_timeout = null;
var ui_hide_timeout = null;

// Song metadata and state
var title="", artist="", timestamp=null, playing=false;

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
  widget_container = document.getElementsByClassName("widget-container")[0];
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
        playing = data['playing'];
        song_changed = data['song_changed'];

        // Hide or unhide the UI based on the playback state
        if (playing) {    // Playing
          if (ui_hide_timeout !== null) {
            // Unset hide timeout
            clearTimeout(ui_hide_timeout);
            ui_hide_timeout = null;
          }
          showUI();
        } else {          // Paused
          if (ui_hide_timeout === null) {
            // Hide after being paused for this amount of time
            ui_hide_timeout = setTimeout(hideUI, ON_PAUSE_UI_HIDE_TIMEOUT);
          }
        }

        // Only update necessary parts of UI based on what changed
        if (song_changed) {       // New song is playing
          // Preload album art and update
          img_preloader.open("GET", "get-song-artwork");
          img_preloader.send();

        } else {                  // Only playback state changed
          // Check for updated info again
          setTimeout(getSongInfo, 250);
        }
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
  #text_container = null;
  #main = null;
  #scrollback = null;
  #computed_style = null;
  #font_size = null;
  #scroll_width = null;
  #scroll_time = null;
  #needs_scroll = false;
  #currently_scrolling = false;
  #pause_timeout = null;
  #edgemask_timeout = null;
  pause_time = TEXT_SCROLL_PAUSE_TIME;

  constructor(text_container) {
    this.#text_container = text_container;
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
        this.#resetScroll();
      }
    } else if (this.#needs_scroll && this.#pause_timeout === null) {
      // Enable scrolling again if we need to scroll and it was disabled
      this.animationEnded();
    } else if (!this.#needs_scroll) {
      this.#edgeMaskUnset();
      if (this.#pause_timeout !== null) {
        // Disable scrolling if we don't need to scroll and it was enabled (paused)
        clearTimeout(this.#pause_timeout);
        this.#pause_timeout = null;
      }
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

  #edgeMaskSetRight() {
    this.#text_container.classList.remove("scroll-edgemask-both");
    this.#text_container.classList.add("scroll-edgemask-right");
    this.#text_container.style.animation = "";
  }

  #edgeMaskSetBoth() {
    this.#text_container.classList.remove("scroll-edgemask-right");
    this.#text_container.classList.add("scroll-edgemask-both");
    this.#text_container.style.animation = TEXT_SCROLL_EDGEMASK_FADE_TIME + " linear scroll-edgemask-right-to-both";
  }

  #edgeMaskUnset() {
    this.#text_container.classList.remove("scroll-edgemask-right");
    this.#text_container.classList.remove("scroll-edgemask-both");
    this.#text_container.style.animation = "";
  }

  startScroll() {
    // Forget the timeout that called us
    this.#pause_timeout = null;
    // If scrolling is still necessary, start scrolling
    if (this.#needs_scroll) {
      this.#currently_scrolling = true;
      this.#setScrollAnimation();
      this.#edgeMaskSetBoth();
      this.#edgemask_timeout = setTimeout(
          () => this.#edgeMaskSetRight(),
          (this.#scroll_width * 1000) / (this.#font_size * TEXT_SCROLL_SPEED)
        );
    }
  }

  #resetScroll() {
    this.#currently_scrolling = false;
    this.#resetScrollAnimation();
    clearTimeout(this.#edgemask_timeout);
  }

  resetScroll() {
    this.#resetScroll();
    this.resizeEvent();
  }

  animationEnded() {
    this.#currently_scrolling = false;
    this.#resetScrollAnimation();
    // If scrolling is still necessary, pause and then scroll again
    if (this.#needs_scroll) {
      this.#edgeMaskSetRight();
      this.#pause_timeout = setTimeout(() => this.startScroll(), this.pause_time);
    } else {
      this.#edgeMaskUnset();
    }
  }
}

// Hide UI with animation
function hideUI() {
  if (ui_should_be_shown) {
    // Mark that we want to hide the UI
    ui_should_be_shown = false;
    // Check if there's already a UI animation currently being played
    if (ui_animation_timeout === null) {
      // If there isn't, then we can hide the UI
      ui_shown = false;
      widget_container.classList.add("hiding");
      ui_animation_timeout = setTimeout(afterUIToggle, UI_HIDE_TIME);
    }
    // Otherwise, this will be handled by afterUIToggle()
  }
}

// Show UI with animation
function showUI() {
  if (!ui_should_be_shown) {
    // Mark that we want to show the UI
    ui_should_be_shown = true;
    // Check if there's already a UI animation currently being played
    if (ui_animation_timeout === null) {
      // If there isn't, then we can hide the UI
      ui_shown = true;
      widget_container.classList.remove("hidden");
      widget_container.classList.add("unhiding");
      ui_animation_timeout = setTimeout(afterUIToggle, UI_UNHIDE_TIME);
    }
    // Otherwise, this will be handled by afterUIToggle()
  }
}

// Handle post-animation tasks after the UI is hidden or shown
function afterUIToggle() {
  // Finalize animation
  if (ui_shown) {
    widget_container.classList.remove("unhiding");
  } else {
    widget_container.classList.add("hidden");
    widget_container.classList.remove("hiding");
  }
  // Handle any blocked requests done during the timeout
  ui_animation_timeout = null;
  if (ui_shown != ui_should_be_shown) {
    // Reset ui_should_be_shown so the function we run knows that it has work to do
    ui_should_be_shown = ui_shown;
    if (ui_shown)
      hideUI();
    else
      showUI();
  }
}
