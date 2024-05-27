const css_root = document.querySelector(":root");
var text_size;
var col_right;

function adjustTextSize() {
  text_size = col_right.clientHeight * 0.35;
  css_root.style.setProperty('--text-size', text_size+"px");
}

function init() {
  col_right = document.getElementsByClassName("col-right")[0];
  window.addEventListener("resize", adjustTextSize);
  adjustTextSize();
}

window.addEventListener("load", init);
