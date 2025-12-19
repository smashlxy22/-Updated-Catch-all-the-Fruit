"use strict";

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = canvas.width; let H = canvas.height; // will update on resize

// Resize canvas to match displayed size and devicePixelRatio for crisp rendering
const wrapper = document.getElementById('gameWrapper');
function resizeCanvas(){
	const dpr = Math.max(1, window.devicePixelRatio || 1);
	// compute display size from wrapper (CSS) if available
	const rect = wrapper ? wrapper.getBoundingClientRect() : canvas.getBoundingClientRect();
	const displayW = Math.max(1, Math.floor(rect.width));
	const displayH = Math.max(1, Math.floor(rect.height));
	canvas.style.width = displayW + 'px';
	canvas.style.height = displayH + 'px';
	canvas.width = Math.floor(displayW * dpr);
	canvas.height = Math.floor(displayH * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	W = canvas.width / dpr; H = canvas.height / dpr;
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', ()=> setTimeout(resizeCanvas, 120));
// initial resize
resizeCanvas();

let keys = {};
window.addEventListener('keydown', e => {
	keys[e.key.toLowerCase()] = true;
	if (e.key === 'Escape') {
		const nameModal = document.getElementById('nameModal');
		if (nameModal && nameModal.style.display !== 'none') {
			// Close name modal if open
			nameModal.style.display = 'none';
			showGameOverMenu();
		} else if (running) {
			togglePause();
		}
	}
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// --- Audio (WebAudio, lazy init) ---
let audioCtx = null;
let musicInterval = null;
let musicGain = null;
let audioStarted = false;
let audioEnabled = true;
// button reference (exists in DOM since script placed at body end)
const audioToggleBtn = document.getElementById('audioToggle');
let sfxGain = null;
let desiredMusicVol = 0.18;
let desiredSfxVol = 0.06;
// start menu refs
const startMenu = document.getElementById('startMenu');
const playBtn = document.getElementById('playBtn');
const bestScoreEl = document.getElementById('bestScore');
const lastScoreEl = document.getElementById('lastScore');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// Make canvas focusable so we can move focus for accessibility
if (canvas && !canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');

function ensureAudio() {
	if (audioCtx) return;
	const AC = window.AudioContext || window.webkitAudioContext;
	audioCtx = new AC();
	// create sfx gain node and set initial sfx volume
	if (!sfxGain) {
		sfxGain = audioCtx.createGain();
		sfxGain.gain.value = desiredSfxVol;
		sfxGain.connect(audioCtx.destination);
	}
}

function playNote(freq, time=0.12, type='sine', when=0) {
	if (!audioCtx) return;
	const o = audioCtx.createOscillator();
	const g = audioCtx.createGain();
	o.type = type; o.frequency.value = freq;
	o.connect(g); g.connect(musicGain || audioCtx.destination);
	const now = audioCtx.currentTime + when;
	g.gain.setValueAtTime(0, now);
	g.gain.linearRampToValueAtTime(0.12, now + 0.01);
	g.gain.exponentialRampToValueAtTime(0.001, now + time);
	o.start(now); o.stop(now + time + 0.02);
}

function startMusic(){
	if (!audioCtx) return;
	if (musicInterval) return;
	musicGain = audioCtx.createGain();
	// louder music
	musicGain.gain.value = desiredMusicVol;
	// mellow filter for elevator/pad sound
	const filter = audioCtx.createBiquadFilter();
	filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 0.7;
	musicGain.connect(filter);
	filter.connect(audioCtx.destination);

	// simple slow chord progression for elevator vibe
	const chords = [
		[261.63, 329.63, 392.00], // C major-ish
		[220.00, 261.63, 329.63], // A minor-ish
		[293.66, 369.99, 440.00], // D/F# / A
		[246.94, 311.13, 392.00]  // B-flat-ish
	];
	let idx = 0;

	function playChord(freqs, dur = 2.4){
		const now = audioCtx.currentTime;
		for (let f of freqs) {
			const o = audioCtx.createOscillator();
			const g = audioCtx.createGain();
			o.type = 'sine'; o.frequency.value = f;
			o.connect(g); g.connect(musicGain);
			g.gain.setValueAtTime(0.0001, now);
			g.gain.linearRampToValueAtTime(0.08 / freqs.length, now + 0.8);
			g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
			o.start(now); o.stop(now + dur + 0.05);
		}
	}

	// kick off an immediate chord and then schedule repeating chords
	playChord(chords[idx % chords.length]);
	musicInterval = setInterval(()=>{
		idx = (idx + 1) % chords.length;
		playChord(chords[idx]);
	}, 1800);
}

function stopMusic(){
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  if (musicGain) { musicGain.disconnect(); musicGain = null; }
}

function playSfx(freq, duration=0.14, type='square', vol=0.18){
	if (!audioCtx || !audioEnabled) return;
	const o = audioCtx.createOscillator();
	const g = audioCtx.createGain();
	o.type = type; o.frequency.value = freq;
	o.connect(g); g.connect(sfxGain || audioCtx.destination);
	const now = audioCtx.currentTime;
	g.gain.setValueAtTime(0.0001, now);
	g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), now + 0.005);
	g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
	o.start(now); o.stop(now + duration + 0.02);
}

function playPointSound(){ playSfx(1200, 0.08, 'sine', desiredSfxVol); }
function playHitSound(){ playSfx(180, 0.28, 'saw', Math.min(0.12, desiredSfxVol*1.5)); }

function resumeAudioOnGesture(){
  if (audioStarted) return;
  ensureAudio();
  // Resume the context if suspended (autoplay policy)
  if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
  audioStarted = true;
  if (audioEnabled) startMusic();
}

// Start audio after first user gesture
window.addEventListener('pointerdown', resumeAudioOnGesture, { once: true });
window.addEventListener('keydown', resumeAudioOnGesture, { once: true });

// Pointer / touch controls: allow dragging on canvas to move basket
let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
	// resume audio is bound once globally; also start dragging
	try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
	dragging = true;
	const rect = canvas.getBoundingClientRect();
	const x = (e.clientX - rect.left) / (rect.width) * W;
	player.x = Math.max(0, Math.min(W - player.w, x - player.w/2));
});
canvas.addEventListener('pointermove', (e) => {
	if (!dragging) return;
	const rect = canvas.getBoundingClientRect();
	const x = (e.clientX - rect.left) / (rect.width) * W;
	player.x = Math.max(0, Math.min(W - player.w, x - player.w/2));
});
['pointerup','pointercancel','pointerleave'].forEach(ev => canvas.addEventListener(ev, (e) => { dragging = false; try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); } catch(e){} }));

// Audio toggle button behavior
function updateAudioButton(){
	if (!audioToggleBtn) return;
	// single speaker icon; lighter when enabled, dim when disabled
	if (audioEnabled) {
		audioToggleBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10v4h4l5 5V5L7 10H3z" fill="#eee"/><path d="M16 8a4 4 0 010 8" stroke="#eee" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
	} else {
		audioToggleBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10v4h4l5 5V5L7 10H3z" fill="#666"/></svg>';
	}

	// update ARIA state and accessible label
	audioToggleBtn.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
	audioToggleBtn.setAttribute('aria-label', audioEnabled ? 'Audio on. Click to mute.' : 'Audio off. Click to unmute.');
}

function toggleAudio(){
	audioEnabled = !audioEnabled;
	updateAudioButton();
	if (!audioEnabled) {
		stopMusic();
		if (audioCtx && audioCtx.suspend) audioCtx.suspend();
	} else {
		// if never started, resume on gesture; else resume immediately
		if (!audioStarted) {
			resumeAudioOnGesture();
		} else {
			if (audioCtx && audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
			startMusic();
		}
	}
}

if (audioToggleBtn) {
		audioToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
		updateAudioButton();
}

// Fullscreen helpers: request/exit/toggle for the game wrapper (supports prefixes)
function requestFullscreen(){
	const el = document.getElementById('gameWrapper') || document.documentElement;
	if (el.requestFullscreen) return el.requestFullscreen();
	if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
}
function exitFullscreen(){
	if (document.exitFullscreen) return document.exitFullscreen();
	if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
}
function toggleFullscreen(){
	const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
	if (!fsEl) requestFullscreen(); else exitFullscreen();
}
if (fullscreenBtn) {
	fullscreenBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
}
// keyboard quick toggle (F)
window.addEventListener('keydown', (e) => { if (e.key && e.key.toLowerCase() === 'f') toggleFullscreen(); });

// volume sliders
const musicSlider = document.getElementById('musicVol');
const sfxSlider = document.getElementById('sfxVol');
if (musicSlider) {
	musicSlider.addEventListener('input', (e)=>{
		desiredMusicVol = parseFloat(e.target.value);
		if (musicGain) musicGain.gain.value = desiredMusicVol;
	});
}
if (sfxSlider) {
	sfxSlider.addEventListener('input', (e)=>{
		desiredSfxVol = parseFloat(e.target.value);
		if (sfxGain) sfxGain.gain.value = desiredSfxVol;
	});
}

const player = {
	w: 72, h: 16,
	x: W/2 - 36, y: H - 60,
	speed: 320
};

let obstacles = [];
let lastTime = 0;
let spawnTimer = 0;
let spawnInterval = 0.9; // seconds between fruit spawns
let running = false; // don't start until user clicks Play
let paused = false;
let score = 0;
const HS_KEY = 'fruit_catcher_highscore_v1';
const LB_KEY = 'fruit_catcher_leaderboard_v1';
const LAST_PLAYER_KEY = 'fruit_catcher_lastplayer_v1';
let highScore = 0;
let lastPlayerName = '';
try { lastPlayerName = localStorage.getItem(LAST_PLAYER_KEY) || ''; } catch (e) { lastPlayerName = ''; }
try { highScore = parseInt(localStorage.getItem(HS_KEY)) || 0; } catch (e) { highScore = 0; }

// Leaderboard functions
function loadLeaderboard() {
	try {
		const data = localStorage.getItem(LB_KEY);
		return data ? JSON.parse(data) : [];
	} catch (e) { return []; }
}
function saveLeaderboard(lb) {
	try { localStorage.setItem(LB_KEY, JSON.stringify(lb)); } catch (e) {}
}
function addToLeaderboard(name, score) {
	const lb = loadLeaderboard();
	lb.push({ name: name.slice(0, 12), score });
	lb.sort((a, b) => b.score - a.score);
	const top10 = lb.slice(0, 10);
	saveLeaderboard(top10);
	return top10;
}
function qualifiesForLeaderboard(score) {
	const lb = loadLeaderboard();
	return lb.length < 10 || score > lb[lb.length - 1].score;
}
function renderLeaderboard() {
	const el = document.getElementById('leaderboardList');
	if (!el) return;
	const lb = loadLeaderboard();
	if (lb.length === 0) {
		el.innerHTML = '<li class="lb-empty">No scores yet</li>';
	} else {
		el.innerHTML = lb.map((e, i) => {
			const isCurrent = lastPlayerName && e.name === lastPlayerName;
			return `<li class="${isCurrent ? 'lb-current' : ''}"><span class="lb-rank">${i+1}.</span> <span class="lb-name">${e.name}</span> <span class="lb-score">${e.score}</span></li>`;
		}).join('');
	}
}

// populate start menu best score display if present
if (bestScoreEl) bestScoreEl.textContent = 'Best: ' + highScore;
let difficulty = 0; // scales with time
let popups = []; // floating score popups
let particles = []; // particle effects
let misses = 0;
const MAX_MISSES = 4;

function rand(min, max) { return Math.random()*(max-min)+min; }

function spawnObstacle() {
	// choose fruit type: apple, banana, blueberry
	const roll = Math.random();
	// slower base speeds suitable for ages 4+; difficulty still affects speed mildly
	const speed = rand(50 + difficulty*15, 100 + difficulty*30);
	if (roll < 0.45) {
		// apple
		const size = Math.floor(rand(30, 44));
		const r = size/2;
		const x = rand(r + 8, W - r - 8);
		const color = '#e63946';
		obstacles.push({ type: 'apple', x, y: -size, r, w: size, h: size, color, speed });
	} else if (roll < 0.8) {
		// banana (elliptical)
		const w = Math.floor(rand(44, 72));
		const h = Math.floor(rand(18, 28));
		const r = Math.max(w,h)/2; // collision radius approx
		const x = rand(r + 8, W - r - 8);
		const color = '#ffd166';
		obstacles.push({ type: 'banana', x, y: -h, r, w, h, color, speed });
	} else {
		// blueberry
		const size = Math.floor(rand(12, 20));
		const r = size/2;
		const x = rand(r + 8, W - r - 8);
		const color = '#3a86ff';
		obstacles.push({ type: 'blueberry', x, y: -size, r, w: size, h: size, color, speed });
	}
}

function circleRectOverlap(cx, cy, r, rect){
	const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
	const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
	const dx = cx - closestX;
	const dy = cy - closestY;
	return (dx*dx + dy*dy) < (r*r);
}

function rectsOverlap(a,b){
	// if obstacle is circular use circle-vs-rect, otherwise fallback to rect-vs-rect
	if (b.r !== undefined) {
		const cx = b.x;
		const cy = b.y + b.r;
		return circleRectOverlap(cx, cy, b.r, a);
	}
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function update(dt){
	if (!running || paused) return;
	// player movement
	let dir = 0;
	if (keys['arrowleft'] || keys['a']) dir -= 1;
	if (keys['arrowright'] || keys['d']) dir += 1;
	player.x += dir * player.speed * dt;
	if (player.x < 0) player.x = 0;
	if (player.x + player.w > W) player.x = W - player.w;

	// spawn obstacles
	spawnTimer += dt;
	if (spawnTimer >= spawnInterval) {
		spawnTimer = 0;
		spawnObstacle();
		// gentler ramp: keep fruits more spaced for younger players
		if (spawnInterval > 0.7) spawnInterval *= 0.995;
		difficulty += 0.0025;
	}

	// update obstacles
	for (let i = obstacles.length-1; i>=0; i--) {
		const o = obstacles[i];
		o.y += o.speed * dt;
			// if fruit falls past bottom, simply remove it (missed)
			if (o.y - (o.r||0) > H) {
				obstacles.splice(i,1);
				misses += 1;
				if (misses >= MAX_MISSES) {
					// game over
					// persist high score if we beat it
					try { if (score > highScore) { highScore = score; localStorage.setItem(HS_KEY, String(highScore)); } } catch (e) {}
					running = false;
					stopMusic();
					// check leaderboard qualification
					if (qualifiesForLeaderboard(score)) {
						showNameModal(score);
					} else {
						showGameOverMenu();
					}
				}
				continue;
			}
		// catch: when fruit overlaps basket, collect it for points
		if (rectsOverlap(player, o)) {
			const catchX = o.x;
			const catchY = o.y + (o.r||o.h/2);
			obstacles.splice(i,1);
			// points mapping: banana=3, apple=2, blueberry=1
			let pts = 1;
			if (o.type === 'banana') pts = 3;
			else if (o.type === 'apple') pts = 2;
			score += pts;
			playPointSound();
			popups.push({ x: catchX, y: catchY, text: '+'+pts, alpha: 1, vy: -60, life: 0.9, color: o.color });
			// Create particles
			for (let j = 0; j < 8; j++) {
				const angle = (Math.PI * 2 * j) / 8;
				const speed = rand(30, 80);
				particles.push({
					x: catchX,
					y: catchY,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					life: 0.4,
					size: rand(2, 4),
					color: o.color
				});
			}
			continue;
		}
	}

	// update popups
	for (let i = popups.length-1; i >= 0; i--) {
		const p = popups[i];
		p.y += p.vy * dt;
		p.life -= dt;
		p.alpha = Math.max(0, p.life / 0.9);
		if (p.life <= 0) popups.splice(i,1);
	}

	// update particles
	for (let i = particles.length-1; i >= 0; i--) {
		const p = particles[i];
		p.x += p.vx * dt;
		p.y += p.vy * dt;
		p.vy += 200 * dt; // gravity
		p.life -= dt;
		if (p.life <= 0) particles.splice(i,1);
	}
}

function showGameOverMenu() {
	if (startMenu) { startMenu.style.display = 'flex'; startMenu.setAttribute('aria-hidden','false'); }
	if (bestScoreEl) bestScoreEl.textContent = 'Best: ' + highScore;
	if (lastScoreEl) lastScoreEl.textContent = 'Your score: ' + score;
	if (playBtn) { playBtn.textContent = 'Play Again'; playBtn.focus(); }
	renderLeaderboard();
}

let pendingScore = 0;
function showNameModal(finalScore) {
	pendingScore = finalScore;
	const modal = document.getElementById('nameModal');
	const modalScore = document.getElementById('modalScore');
	const nameInput = document.getElementById('nameInput');
	if (modal) modal.style.display = 'flex';
	if (modalScore) modalScore.textContent = finalScore;
	if (nameInput) { nameInput.value = ''; nameInput.focus(); }
}

function submitLeaderboardEntry() {
	const nameInput = document.getElementById('nameInput');
	const modal = document.getElementById('nameModal');
	const name = (nameInput && nameInput.value.trim()) || 'Player';
	addToLeaderboard(name, pendingScore);
	lastPlayerName = name;
	try { localStorage.setItem(LAST_PLAYER_KEY, name); } catch (e) {}
	if (modal) modal.style.display = 'none';
	showGameOverMenu();
}

// Pause functions
const pauseMenu = document.getElementById('pauseMenu');
function togglePause() {
	if (paused) resumeGame(); else pauseGame();
}
function pauseGame() {
	paused = true;
	if (pauseMenu) pauseMenu.style.display = 'flex';
	const pauseScoreEl = document.getElementById('pauseScore');
	const pauseMissesEl = document.getElementById('pauseMisses');
	if (pauseScoreEl) pauseScoreEl.textContent = score;
	if (pauseMissesEl) pauseMissesEl.textContent = misses;
	stopMusic();
}
function resumeGame() {
	paused = false;
	if (pauseMenu) pauseMenu.style.display = 'none';
	if (audioStarted && audioEnabled) startMusic();
}
function quitToMenu() {
	paused = false;
	running = false;
	if (pauseMenu) pauseMenu.style.display = 'none';
	showGameOverMenu();
}

function draw(){
	// clear
	ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);

	// player
	// draw player as a basket
	const bx = player.x + player.w/2;
	ctx.fillStyle = '#6b3e26';
	// basket body
	ctx.beginPath();
	ctx.moveTo(player.x, player.y + player.h);
	ctx.lineTo(player.x + player.w, player.y + player.h);
	ctx.quadraticCurveTo(bx, player.y + player.h + 22, player.x, player.y + player.h);
	ctx.fill();
	// basket rim
	ctx.fillStyle = '#8b5a39';
	ctx.fillRect(player.x, player.y + player.h - 6, player.w, 6);

	// falling fruit
	for (const o of obstacles) {
		// (sports visuals removed — only fruits handled below)
		if (o.type === 'apple' || o.type === 'blueberry') {
			const cx = o.x;
			const cy = o.y + o.r;
			// berry / apple body
			ctx.fillStyle = o.color;
			ctx.beginPath();
			ctx.arc(cx, cy, o.r, 0, Math.PI*2);
			ctx.fill();
			// highlight
			ctx.fillStyle = 'rgba(255,255,255,0.12)';
			ctx.beginPath();
			ctx.ellipse(cx - o.r*0.35, cy - o.r*0.35, o.r*0.35, o.r*0.25, 0, 0, Math.PI*2);
			ctx.fill();
			if (o.type === 'apple') {
				// leaf & stem for apple
				ctx.fillStyle = '#2b8b44';
				ctx.beginPath();
				ctx.ellipse(cx + o.r*0.35, cy - o.r*0.5, o.r*0.22, o.r*0.12, -0.6, 0, Math.PI*2);
				ctx.fill();
				ctx.strokeStyle = '#5a3a1b'; ctx.lineWidth = 2;
				ctx.beginPath(); ctx.moveTo(cx + o.r*0.12, cy - o.r*0.5); ctx.lineTo(cx + o.r*0.12, cy - o.r*0.85); ctx.stroke();
			}
		} else if (o.type === 'banana') {
			// banana as filled ellipse with slight rotation
			const cx = o.x;
			const cy = o.y + o.h/2;
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(-0.18);
			ctx.fillStyle = o.color;
			ctx.beginPath();
			ctx.ellipse(0, 0, o.w/2, o.h/2, 0, 0, Math.PI*2);
			ctx.fill();
			// inner stripe
			ctx.fillStyle = 'rgba(0,0,0,0.07)';
			ctx.beginPath();
			ctx.ellipse(0 - o.w*0.08, 0, o.w*0.32, o.h*0.42, -0.18, 0, Math.PI*2);
			ctx.fill();
			// tips
			ctx.fillStyle = '#5a3a1b';
			ctx.beginPath(); ctx.arc(-o.w/2 + 4, 0, 3, 0, Math.PI*2); ctx.fill();
			ctx.beginPath(); ctx.arc(o.w/2 - 4, 0, 3, 0, Math.PI*2); ctx.fill();
			ctx.restore();
		}
	}

	// HUD
	ctx.fillStyle = '#ddd'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'left';
	ctx.fillText('Score: ' + score, 10, 26);
	ctx.fillText('Best: ' + highScore, 10, 48);
	// Miss counter with hearts
	const heartSize = 14;
	const heartX = 10;
	const heartY = 72;
	for (let i = 0; i < MAX_MISSES; i++) {
		const x = heartX + i * (heartSize + 6);
		const isFull = i < MAX_MISSES - misses;
		ctx.fillStyle = isFull ? '#f2a' : '#666';
		ctx.strokeStyle = isFull ? '#f2a' : '#666';
		ctx.lineWidth = 1;
		// Simple heart shape: two circles + triangle
		ctx.beginPath();
		// Left circle
		ctx.arc(x - heartSize/4, heartY - heartSize/4, heartSize/4, 0, Math.PI * 2);
		// Right circle
		ctx.arc(x + heartSize/4, heartY - heartSize/4, heartSize/4, 0, Math.PI * 2);
		ctx.fill();
		// Triangle bottom
		ctx.beginPath();
		ctx.moveTo(x - heartSize/2, heartY - heartSize/4);
		ctx.lineTo(x + heartSize/2, heartY - heartSize/4);
		ctx.lineTo(x, heartY + heartSize/2);
		ctx.closePath();
		ctx.fill();
	}

	// Legend: point values per fruit (top-right)
	ctx.font = 'bold 18px system-ui';
	// increase spacing to reduce crowding
	const boxSize = 14;
	const legendY = 18;
	const lineH = 34; // more vertical spacing between lines
	const legendWidth = 180;
	const legendRightPadding = 12;
	const legendX = W - legendWidth - legendRightPadding; // left edge of legend area

	// positions: color boxes at right inside the legend area, labels right-aligned before boxes
	const boxX = legendX + legendWidth - 18; // right-aligned box inside legend area
	const textX = boxX - 36; // increased gap between text and color box
	ctx.textAlign = 'right';
	// blueberry (1)
	ctx.fillStyle = '#3a86ff'; ctx.fillRect(boxX - boxSize, legendY, boxSize, boxSize);
	ctx.fillStyle = '#ddd'; ctx.fillText('Blueberry: 1', textX, legendY + 14);
	// apple (2)
	ctx.fillStyle = '#e63946'; ctx.fillRect(boxX - boxSize, legendY + lineH, boxSize, boxSize);
	ctx.fillStyle = '#ddd'; ctx.fillText('Apple: 2', textX, legendY + lineH + 14);
	// banana (3)
	ctx.fillStyle = '#ffd166'; ctx.fillRect(boxX - boxSize, legendY + lineH*2, boxSize, boxSize);
	ctx.fillStyle = '#ddd'; ctx.fillText('Banana: 3', textX, legendY + lineH*2 + 14);
	ctx.textAlign = 'center';

	// draw particles
	for (const p of particles) {
		ctx.globalAlpha = Math.max(0, p.life / 0.4);
		ctx.fillStyle = p.color;
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;

	// draw floating score popups
	ctx.textAlign = 'center';
	for (const p of popups) {
		ctx.globalAlpha = p.alpha;
		ctx.fillStyle = p.color || '#fff';
		ctx.font = '18px system-ui';
		ctx.fillText(p.text, p.x, p.y);
	}
	ctx.globalAlpha = 1;

	// Pause overlay
	if (paused && running) {
		ctx.fillStyle = 'rgba(0,0,0,0.5)';
		ctx.fillRect(0, 0, W, H);
	}

	if (!running) {
		ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, H/2 - 60, W, 120);
		ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '28px system-ui';
		ctx.fillText('Game Over', W/2, H/2 - 8);
		ctx.font = '16px system-ui'; ctx.fillText('Press R to restart', W/2, H/2 + 22);
	}
}

function gameLoop(ts){
	if (!lastTime) lastTime = ts;
	const dt = Math.min(0.05, (ts - lastTime)/1000);
	lastTime = ts;
	update(dt);
	draw();
	requestAnimationFrame(gameLoop);
}

function restart(){
	if (running && !paused) return; // only when game over (allow restart from pause)
	// reset
	obstacles = [];
	popups = [];
	particles = [];
	lastTime = 0;
	spawnTimer = 0;
	spawnInterval = 0.9;
	difficulty = 0;
	paused = false;
	if (score > highScore) {
		highScore = score;
		try { localStorage.setItem(HS_KEY, String(highScore)); } catch (e) {}
	}
	score = 0;
	misses = 0;
	player.x = W/2 - player.w/2;
	running = true;
	// restart music if audio already started
	if (audioStarted && audioEnabled) startMusic();
	// hide menu and clear last score text (accessibility: mark hidden and move focus to canvas)
	if (startMenu) { startMenu.style.display = 'none'; startMenu.setAttribute('aria-hidden','true'); }
	if (pauseMenu) pauseMenu.style.display = 'none';
	if (canvas) canvas.focus();
	if (lastScoreEl) lastScoreEl.textContent = '';
}

// allow immediate restart when game over by pressing R
window.addEventListener('keydown', e => { if (e.key.toLowerCase()==='r' && !running) restart(); });

// initial start
// start loop immediately so menu draws; game state `running` controls updates
requestAnimationFrame(gameLoop);

// wire up start menu play button
if (playBtn) {
	playBtn.addEventListener('click', () => {
		// hide menu
		if (startMenu) { startMenu.style.display = 'none'; startMenu.setAttribute('aria-hidden','true'); }
		// reset & start game
		obstacles = [];
		popups = [];
		particles = [];
		score = 0;
		misses = 0;
		spawnTimer = 0;
		difficulty = 0;
		lastTime = 0;
		paused = false;
		player.x = W/2 - player.w/2;
		if (playBtn) playBtn.textContent = 'Play';
		if (lastScoreEl) lastScoreEl.textContent = '';
		running = true;
		if (audioStarted && audioEnabled) startMusic();
	});
}

// Leaderboard submit button handler
const submitNameBtn = document.getElementById('submitName');
const nameInputEl = document.getElementById('nameInput');
if (submitNameBtn) submitNameBtn.addEventListener('click', submitLeaderboardEntry);
if (nameInputEl) nameInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLeaderboardEntry(); });

// Render leaderboard on initial load
renderLeaderboard();

// Pause menu button handlers
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const quitBtn = document.getElementById('quitBtn');
if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
if (restartBtn) restartBtn.addEventListener('click', () => { restart(); });
if (quitBtn) quitBtn.addEventListener('click', quitToMenu);


