const PORT = 6969;
const TEXT_SCROLL_PAUSE_TIME = 4000;
const TEXT_SCROLL_SPEED = 1.0;
const TEXT_SCROLL_EDGEMASK_FADE_TIME = "250ms";
const UI_HIDE_TIME = 1000;
const UI_UNHIDE_TIME = 500;
const UI_NEXT_SONG_SWITCH_TIME = 250;
const ON_PAUSE_UI_HIDE_TIMEOUT = 5000;

// DOM elements
const css_root = document.querySelector(":root");
var widget_container;
var col_right;
var art;
var song_info;

// State
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
var http_handler = new XMLHttpRequest, img_preloader = new XMLHttpRequest, img_blob = null, old_img_blob = null;
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
  // Find DOM elements
  col_right = document.getElementsByClassName("col-right")[0];
  widget_container = document.getElementsByClassName("widget-container")[0];
  art = Array.from(document.getElementsByClassName("art"));
  song_info = Array.from(document.getElementsByClassName("song-info-container"));

  // Create text scrollers
  song_info[0].title_scroller = new TextScroller(song_info[0].children[0]);
  song_info[0].artist_scroller = new TextScroller(song_info[0].children[1]);
  song_info[1].title_scroller = new TextScroller(song_info[1].children[0]);
  song_info[1].artist_scroller = new TextScroller(song_info[1].children[1]);

  // Hide secondary DOM elements
  art[1].classList.add("hidden");
  song_info[1].classList.add("hidden");
  song_info[1].title_scroller.disable();
  song_info[1].artist_scroller.disable();

  // Set up events
  window.addEventListener("resize", adjustTextSize);
  adjustTextSize();
  getSongInfo();

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

    // Title
    song_info[1].children[0].children[0].textContent = title;
    song_info[1].children[0].children[1].textContent = title;
    // Artist
    song_info[1].children[1].children[0].textContent = artist;
    song_info[1].children[1].children[1].textContent = artist;
    // Artwork
    old_img_blob = img_blob;
    img_blob = URL.createObjectURL(this.response);
    art[1].style.backgroundImage = 'url("' + img_blob + '")';

    // Start switch animation
    // Text
    song_info[1].classList.remove("hidden");
    song_info[1].title_scroller.enable();
    song_info[1].artist_scroller.enable();
    song_info[1].classList.add("new");
    song_info[0].classList.add("old");
    // Artwork
    art[1].classList.remove("hidden");
    art[1].classList.add("new");
    art[0].classList.add("old");

  } catch (error) {
    console.error("Error updating UI.");
    console.error(error);
  }

  setTimeout(updateSongInfoPostAnimation, UI_NEXT_SONG_SWITCH_TIME);
}

function updateSongInfoPostAnimation() {
  // End switch animation
  // Text
  song_info[0].title_scroller.disable();
  song_info[0].artist_scroller.disable();
  song_info[0].classList.add("hidden");
  song_info[0].classList.remove("old");
  song_info[1].classList.remove("new");
  song_info = song_info.reverse();
  // Artwork
  art[0].classList.add("hidden");
  art[0].classList.remove("old");
  art[1].classList.remove("new");
  art = art.reverse();

  // Invalidate old artwork
  if (old_img_blob != null)
    URL.revokeObjectURL(old_img_blob);

  // Check for updated info again
  getSongInfo();
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
  #enabled = true;
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
    // Skip if scroller disabled
    if (!this.#enabled)
      return;

    // Get new font size
    this.#font_size = parseFloat(this.#computed_style.getPropertyValue("font-size"));

    // Adjust animation
    this.#scroll_width = this.#main.scrollWidth;
    this.#main.style.setProperty("--scrollback-amount", this.#scroll_width + "px");
    this.#scrollback.style.setProperty("--scrollback-amount", this.#scroll_width + "px");
    this.#scroll_time = (this.#scroll_width + 3 * this.#font_size) / (this.#font_size * TEXT_SCROLL_SPEED);

    // Determine if scrolling is necessary
    this.#needs_scroll = this.#scroll_width > this.#main.clientWidth;

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
    clearTimeout(this.#edgemask_timeout);
    this.#currently_scrolling = false;
    this.#resetScrollAnimation();
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

  enable() {
    if (!this.#enabled) {
      this.#enabled = true;
      this.resetScroll();
    }
  }

  disable() {
    if (this.#enabled) {
      this.#enabled = false;
      clearTimeout(this.#pause_timeout);
      this.#pause_timeout = null;
      this.#resetScroll();
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
      // If there isn't, then we can show the UI
      ui_shown = true;
      widget_container.classList.remove("hidden");
      widget_container.classList.add("unhiding");
      ui_animation_timeout = setTimeout(afterUIToggle, UI_UNHIDE_TIME);
      // Reset scroll animations
      song_info[0].title_scroller.resetScroll();
      song_info[0].artist_scroller.resetScroll();
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
