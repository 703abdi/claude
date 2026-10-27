document.documentElement.classList.add("js");

// student wins: add a file to assets/wins/ and a line here
const WINS=[
  ["win-01.jpg","$4,525 profit in one day"],
  ["win-02.jpg","$3,566 profit in one day"],
  ["win-03.jpg","$827 profit in one day"],
  ["win-04.jpg","$3,680 profit month"],
  ["win-05.jpg","$655 profit in one day"],
  ["win-06.jpg","$7,610 profit month"],
  ["win-08.jpg","$988 profit off one trade"],
  ["win-09.jpg","+14.38% in one week"],
  ["win-07.jpg","5 green weeks in a row"]
];
// the second copy only exists so the desktop marquee can loop seamlessly
const img=(w,dup)=>dup
  ?`<img class="pay dup" src="assets/wins/${w[0]}" alt="" aria-hidden="true" loading="lazy" width="760" height="830">`
  :`<img class="pay" src="assets/wins/${w[0]}" alt="Student win: ${w[1]}" loading="lazy" width="760" height="830">`;
document.getElementById("track").innerHTML=WINS.map(w=>img(w,false)).join("")+WINS.map(w=>img(w,true)).join("");

// video: load the YouTube player on click so the page stays fast
const vsl=document.getElementById("vsl");
let played=false;
function playVsl(){
  if(played)return;played=true;
  vsl.removeAttribute("role");vsl.removeAttribute("tabindex");
  vsl.innerHTML='<iframe src="https://www.youtube-nocookie.com/embed/7UiUAxwDPA0?autoplay=1&rel=0&playsinline=1" title="Welcome to Tawakkul Trading" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>';
}
vsl.addEventListener("click",playVsl);
vsl.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();playVsl()}});

// fade sections in as they scroll into view
const reveals=document.querySelectorAll(".reveal");
if("IntersectionObserver" in window){
  const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target)}}),{threshold:.12});
  reveals.forEach(el=>io.observe(el));
}else reveals.forEach(el=>el.classList.add("in"));

// sticky mobile CTA: only on phones, and only while no page CTA is on screen
const mbar=document.getElementById("mbar");
const phone=matchMedia("(max-width:600px)");
const ctas=[document.getElementById("hero-cta"),document.querySelector("#book .btn-gold"),document.getElementById("faq-cta")];
const seen=new Set();
function syncBar(){mbar.hidden=!phone.matches;mbar.classList.toggle("off",seen.size>0)}
if("IntersectionObserver" in window){
  const co=new IntersectionObserver(es=>{es.forEach(x=>x.isIntersecting?seen.add(x.target):seen.delete(x.target));syncBar()});
  ctas.forEach(c=>co.observe(c));
}
phone.addEventListener("change",syncBar);
syncBar();
