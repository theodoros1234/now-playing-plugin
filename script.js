const css_root = document.querySelector(":root");
var col_right;

function adjustTextSize() {
  var new_height = col_right.clientHeight * 0.35;
  css_root.style.setProperty('--text-size', new_height+"px");
}

function init() {
  col_right = document.getElementsByClassName("col-right")[0];
  window.addEventListener("resize", adjustTextSize);
  adjustTextSize();
}

window.addEventListener("load", init);
