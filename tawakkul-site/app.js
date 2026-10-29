document.documentElement.classList.add("js");

// Vercel Web Analytics + Speed Insights (cookieless, no personal data).
// They only collect once both are switched on in the Vercel dashboard for this project.
window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};
window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments)};
["/_vercel/insights/script.js","/_vercel/speed-insights/script.js"].forEach(src=>{
  const s=document.createElement("script");s.src=src;s.defer=true;document.head.appendChild(s);
});
const track=(name,data)=>{try{window.va("event",{name,data})}catch(_){}};

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
  track("Video Play",{video:"welcome"});
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

// click tracking: which button people press, and where on the page it was
const where=el=>el.closest("nav")?"nav":el.closest("#mbar")?"sticky bar":el.closest("#top")?"hero":el.closest("#book")?"bottom":el.closest("#faq")?"after FAQ":"other";
document.addEventListener("click",e=>{
  const a=e.target.closest("a[href]");if(!a)return;
  const h=a.getAttribute("href");
  if(h.includes("abdiform.vercel.app/apply"))track("Book a Call Click",{location:where(a)});
  else if(h.includes("whop.com"))track("Trading Room Click",{location:where(a)});
  else if(/instagram\.com|youtube\.com|^mailto:/.test(h))track("Social Click",{network:h.startsWith("mailto:")?"email":h.includes("instagram")?"instagram":"youtube"});
});

// which FAQ questions people open (the objections that matter most)
document.querySelectorAll("#faq details").forEach(d=>d.addEventListener("toggle",()=>{if(d.open)track("FAQ Open",{question:d.querySelector("summary").textContent})}));

// how far down the page people get
const depth=new Set();
addEventListener("scroll",()=>{
  const max=document.documentElement.scrollHeight-innerHeight;if(max<=0)return;
  const pct=scrollY/max*100;
  [25,50,75,100].forEach(m=>{if(pct>=m-1&&!depth.has(m)){depth.add(m);track("Scroll Depth",{percent:String(m)})}});
},{passive:true});
