const STORAGE_KEY='taithai_movie_memory_v2';
const $=id=>document.getElementById(id);
let allMovies=[],round=[],roundWinners=[],pairIndex=0,roundNumber=1,choicesMade=0,winner=null;

function loadMovies(){
  try{
    const hashMovies=location.hash.startsWith('#movies=')?decodeURIComponent(location.hash.slice('#movies='.length)):'';
    const transferred=window.name.startsWith('movie-memory-game:')?window.name.slice('movie-memory-game:'.length):'';
    const parsed=JSON.parse(hashMovies||localStorage.getItem(STORAGE_KEY)||localStorage.getItem('taithai_movie_memory_v1')||transferred||'[]');
    if(hashMovies){try{history.replaceState(null,'',location.pathname+location.search)}catch{}}
    return Array.isArray(parsed)?parsed.filter(movie=>movie&&movie.title):[];
  }catch{return[]}
}
function shuffle(list){const copy=[...list];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function poster(movie){return movie.posterImg||movie.ticketImg||''}
function show(view){['introView','battleView','resultView'].forEach(id=>$(id).hidden=id!==view)}
function init(){
  allMovies=loadMovies();
  $('introCount').textContent=allMovies.length?`มีหนัง ${allMovies.length} เรื่องพร้อมเข้าแข่งขัน`:'ยังไม่มีหนังในคอลเลกชัน';
  $('startGameBtn').hidden=allMovies.length<2;
  $('addMovieLink').hidden=allMovies.length>=2;
}
function startGame(){
  round=shuffle(allMovies);roundWinners=[];pairIndex=0;roundNumber=1;choicesMade=0;winner=null;
  $('restartHeaderBtn').hidden=false;show('battleView');showPair();
}
function showPair(){
  if(pairIndex>=round.length){
    if(roundWinners.length===1){finish(roundWinners[0]);return}
    round=shuffle(roundWinners);roundWinners=[];pairIndex=0;roundNumber++;
  }
  if(pairIndex===round.length-1){roundWinners.push(round[pairIndex]);pairIndex++;showPair();return}
  const left=round[pairIndex],right=round[pairIndex+1];
  $('leftTitle').textContent=left.title;$('rightTitle').textContent=right.title;
  $('leftPoster').src=poster(left);$('rightPoster').src=poster(right);
  $('leftPoster').style.display=poster(left)?'block':'none';$('rightPoster').style.display=poster(right)?'block':'none';
  $('roundLabel').textContent=`รอบที่ ${roundNumber}`;
  $('progressLabel').textContent=`เลือกแล้ว ${choicesMade} / ${Math.max(1,allMovies.length-1)}`;
  $('progressBar').style.width=`${Math.min(100,choicesMade/Math.max(1,allMovies.length-1)*100)}%`;
  $('leftChoice').onclick=()=>choose(left);$('rightChoice').onclick=()=>choose(right);
}
function choose(movie){roundWinners.push(movie);pairIndex+=2;choicesMade++;showPair()}
function finish(movie){
  winner=movie;$('winnerTitle').textContent=movie.title;$('winnerPoster').src=poster(movie);
  $('winnerPoster').style.display=poster(movie)?'block':'none';
  $('progressBar').style.width='100%';show('resultView');
}
function loadImage(src){
  return new Promise(resolve=>{if(!src){resolve(null);return}const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src});
}
function wrapText(ctx,text,maxWidth){
  const segments=String(text).includes(' ')?String(text).split(/(\s+)/):Array.from(String(text));
  const lines=[];let line='';
  for(const segment of segments){const test=line+segment;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line.trim());line=segment.trimStart()}else line=test}
  if(line)lines.push(line.trim());return lines.slice(0,3);
}
async function createStoryBlob(){
  const canvas=$('storyCanvas'),ctx=canvas.getContext('2d'),img=await loadImage(poster(winner));
  const gradient=ctx.createLinearGradient(0,0,1080,1920);gradient.addColorStop(0,'#2d170d');gradient.addColorStop(.55,'#0d0a08');gradient.addColorStop(1,'#160e09');ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1920);
  if(img){const scale=Math.max(1080/img.width,1450/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(1080-w)/2,0,w,h)}
  const fade=ctx.createLinearGradient(0,600,0,1920);fade.addColorStop(0,'rgba(13,10,8,0)');fade.addColorStop(.55,'rgba(13,10,8,.78)');fade.addColorStop(1,'#0d0a08');ctx.fillStyle=fade;ctx.fillRect(0,0,1080,1920);
  ctx.textAlign='center';ctx.fillStyle='#ffb547';ctx.font='700 34px sans-serif';ctx.fillText('🏆  MY FAVORITE MOVIE',540,1370);
  ctx.fillStyle='#f8f1e7';ctx.font='700 82px sans-serif';const lines=wrapText(ctx,winner.title,880);lines.forEach((line,index)=>ctx.fillText(line,540,1485+index*92));
  ctx.fillStyle='#a69788';ctx.font='500 28px sans-serif';ctx.fillText('Movie Memory · taithai.app',540,1810);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png',.95));
}
async function shareStory(){
  if(!winner)return;
  $('shareStoryBtn').disabled=true;$('shareStoryBtn').textContent='กำลังสร้างภาพ...';
  try{
    const blob=await createStoryBlob();
    if(!blob)throw new Error('Unable to create story image');
    const file=new File([blob],'movie-memory-story.png',{type:'image/png'});
    if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:`หนังเรื่องโปรดของฉันคือ ${winner.title}`})}
    else{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('shareHelp').textContent='บันทึกภาพแล้ว นำไปเพิ่มใน Instagram Story ได้เลย'}
  }catch(error){if(error.name!=='AbortError')$('shareHelp').textContent='สร้างภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
  finally{$('shareStoryBtn').disabled=false;$('shareStoryBtn').textContent='แชร์ลง IG Story'}
}
$('startGameBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);$('restartHeaderBtn').addEventListener('click',startGame);$('shareStoryBtn').addEventListener('click',shareStory);init();
