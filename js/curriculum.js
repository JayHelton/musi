import { audioCtx, ensureAudio } from './audio.js';

const CURRICULA = {
  guitar: {
    label: 'Guitar',
    daily: '~60 min',
    blocks: [
      {name:'Music Theory',duration:10,link:'scales',linkLabel:'Open Scale Quiz'},
      {name:'Warm-up',duration:5,sub:'Chromatic runs, spider exercises, finger stretches'},
      {name:'Gallop Picking',duration:5,sub:'Triplet gallop patterns on open strings and power chords, gradually increasing BPM'},
      {name:'Down-picking Stamina',duration:16,sub:'Sustained down-picking at 80-100% target BPM; rest 1min every 4min'},
      {name:'Modal Practice',duration:10,sub:'Play through one mode per day across the neck; improvise over backing track'},
      {name:'Interval Training',duration:8,link:'intervals',linkLabel:'Open Interval Quiz'},
    ],
    progression: [
      {title:'Weeks 1\u20134: Foundation',items:['Establish consistent daily routine','Gallop picking at 120 BPM clean','Down-picking stamina: 4 minutes continuous at 140 BPM','Learn 3 modes (Ionian, Dorian, Phrygian) in one position','Identify all intervals within an octave by ear']},
      {title:'Weeks 5\u20138: Expand',items:['Gallop picking at 140+ BPM with accents','Down-picking stamina: 8 minutes at 150 BPM','Add Lydian, Mixolydian, Aeolian to mode vocabulary','Practice modes in multiple positions/keys','Begin combining modes over chord progressions']},
      {title:'Weeks 9\u201312: Performance',items:['Gallop picking at 160 BPM with dynamics','Down-picking stamina: full song length (4+ min) at 160 BPM','Fluent in all 7 modes across the neck','Improvise modally over unfamiliar progressions','Record yourself weekly and review for timing/tone']},
    ],
    technique: [
      {title:'Posture & Position',body:'Sit or stand with guitar at chest height. Keep wrist straight, thumb behind the neck midpoint. Avoid hunching\u2014shoulders back, neck relaxed.'},
      {title:'Fretting Hand',body:'Use fingertips just behind frets. Minimal pressure\u2014only enough to sound clean. Keep unused fingers hovering close to strings, not flying away.'},
      {title:'Picking Hand',body:'Anchor lightly with pinky or heel of palm. Hold pick between thumb pad and side of index finger at ~45\u00B0 angle. Motion from wrist, not elbow.'},
      {title:'Hand Synchronization',body:'Both hands must arrive simultaneously. Practice slow chromatic exercises with a metronome, gradually speed up only when perfectly synced.'},
      {title:'Muting',body:'Palm-mute with picking hand heel resting lightly on strings near bridge. Fretting hand mutes unused strings by lightly touching them with available fingers.'},
      {title:'Sweep Picking',body:'Single continuous motion across strings\u2014one note per string. Fret hand rolls across strings rather than barring. Start extremely slow with 3-string arpeggios.'},
      {title:'Legato',body:'Hammer-ons from above the fret, pull-offs with slight sideways flick. Maintain even volume between picked and legato notes. Economy of motion is key.'},
    ],
  },
  piano: {
    label: 'Piano',
    daily: '60 min',
    blocks: [
      {name:'Warm-ups: Hands & Technique',duration:7,sub:'Hanon exercises, finger independence drills, contrary motion scales'},
      {name:'Warm-ups: Scales & Chords',duration:8,sub:'Major/minor scales hands together, arpeggios, chord inversions in all keys',link:'scales',linkLabel:'Open Scale Quiz'},
      {name:'Etude',duration:20,sub:'Technical etude focusing on one skill (Czerny, Burgm\u00FCller, or Chopin). Break into small sections.'},
      {name:'Repertoire Song',duration:25,sub:'Current performance piece. Practice difficult passages isolated, then in context. Run full piece at end.'},
    ],
    progression: [
      {title:'Weeks 1\u20134: Foundation',items:['All major scales hands together at 80 BPM','Solid hand independence in simple etudes','One repertoire piece learned hands separately','Consistent daily 60-min practice habit']},
      {title:'Weeks 5\u20138: Fluency',items:['Major and harmonic minor scales at 100+ BPM','Arpeggios in all inversions','Etude performance-ready','Repertoire piece hands together at 70% tempo']},
      {title:'Weeks 9\u201312: Polish',items:['All scales and arpeggios fluid and even','New etude started','Repertoire piece at full tempo with dynamics','Begin sight-reading practice']},
    ],
    technique: [
      {title:'Posture & Bench',body:'Sit at front half of bench, feet flat, elbows slightly above key level. Back straight but not rigid. Bench height lets forearms be parallel to floor.'},
      {title:'Hand Shape',body:'Curved fingers as if holding a ball. Play on fingertips (pads near tip). Knuckles should not collapse inward. Thumb plays on its side corner.'},
      {title:'Wrist & Arm',body:'Wrist level with hand\u2014not dropped or raised. Use arm weight to produce sound rather than finger pressure alone. Allow natural rotation for scale passages.'},
      {title:'Even Tone',body:'Each finger should produce equal volume. Weak fingers (4, 5) need extra slow practice. Listen critically for unevenness in scale runs.'},
      {title:'Fingering',body:'Follow standard fingering conventions. Thumb crosses under smoothly in scales. Plan fingering before learning passages\u2014relearning costs more time.'},
      {title:'Hands Together',body:'Learn each hand separately first until automatic. Combine at very slow tempo. Identify where coordination breaks and isolate those beats.'},
      {title:'Pedal',body:'Right (sustain) pedal: lift and press on chord changes (legato pedaling). Avoid blurring harmonies. Left (una corda) for soft passages. Listen to the sound.'},
      {title:'Relaxation',body:'Tension is the enemy. Shake out hands between passages. If you feel tightness in forearms or shoulders, stop and reset. Speed comes from relaxation, not force.'},
    ],
  },
  harsh: {
    label: 'Harsh Vocals',
    daily: 'Weekly schedule',
    blocks: [
      {name:'Warm-up',duration:10,sub:'Lip trills, humming, gentle sirens, diaphragm engagement'},
      {name:'Main Practice',duration:40,sub:'See weekly schedule for daily focus'},
      {name:'Cooldown',duration:10,sub:'Gentle humming, steam inhalation, silence for 15+ min after'},
    ],
    schedule: [
      {day:'Monday',focus:'Technique Drills',duration:'45\u201360 min',detail:'Fry screams, false cord activation, diaphragm pulses. Cycle through low/mid/high registers.'},
      {day:'Tuesday',focus:'Endurance Building',duration:'30\u201345 min',detail:'Sustained growls in 30-sec sets with rest. Build continuous phonation duration.'},
      {day:'Wednesday',focus:'Texture & Dynamics',duration:'45\u201360 min',detail:'Transition between fry/false cord. Practice volume swells, whisper-to-scream dynamics.'},
      {day:'Thursday',focus:'Rest / Light Warm-up',duration:'15 min max',detail:'Vocal rest day. At most, gentle humming and lip trills. Hydrate heavily.'},
      {day:'Friday',focus:'Musical Application',duration:'45\u201360 min',detail:'Practice over backing tracks. Work on rhythmic precision, lyric delivery, tone matching.'},
      {day:'Saturday',focus:'Performance Simulation',duration:'30\u201360 min',detail:'Run full songs or setlists. Simulate stage energy. Record and review.'},
      {day:'Sunday',focus:'Full Rest',duration:'\u2014',detail:'Complete vocal rest. Hydration and recovery.'},
    ],
    progression: [
      {title:'Weeks 1\u20134: Consistency',items:['Establish safe technique with no pain','5\u201310 min sustained distortion','Basic fry and false cord sounds clear','Consistent daily warm-up/cooldown habit']},
      {title:'Weeks 5\u20138: Duration & Dynamics',items:['15\u201320 min sustained distortion sessions','Control volume from whisper to full','Smooth transitions between registers','Incorporate into song phrases']},
      {title:'Weeks 9\u201312: Musicality & Endurance',items:['30+ min sustained performance','Dynamic expression within harsh tones','Full songs performed start to finish','Record and critically evaluate weekly']},
    ],
    technique: [
      {title:'Distortion Source',body:'Sound is created by controlled vibration of false folds (vestibular folds) or arytenoid cartilage flutter\u2014never from true vocal cords alone under strain.'},
      {title:'Breath Support',body:'Drive the sound from the diaphragm. Engage lower abs, expand ribcage. Airflow should be steady and controlled\u2014more air \u2260 more distortion.'},
      {title:'Open Throat',body:'Keep the throat open as if yawning or saying "aah" at the doctor. The distortion happens above this open space. A closed throat leads to injury.'},
      {title:'Compression',body:'Gentle glottal compression provides the "grit." Think of the slight hold before a cough\u2014use that engagement lightly. Never force or squeeze.'},
      {title:'Resonance & Placement',body:'Direct sound into mask (nasal/sinus area) for mids and highs. Chest resonance for lows. Experiment with mouth shape to find overtones.'},
      {title:'Pitch Underneath',body:'Maintain a clean pitch beneath the distortion. Practice singing the note clean, then gradually add distortion. The melody should still be discernible.'},
      {title:'No Pain Rule',body:'If it hurts, stop immediately. Soreness, scratchiness, or voice loss are red flags. Rest until fully recovered before resuming. Long-term health > short-term gains.'},
    ],
  },
  singing: {
    label: 'Singing (CCM)',
    daily: '~115 min',
    blocks: [
      {name:'Body Warm-up',duration:10,sub:'Stretching, posture alignment, breath exercises (4-7-8 breathing), body engagement'},
      {name:'Vocal Warm-up',duration:10,sub:'Lip trills, humming, 5-note scales, octave sirens, messa di voce'},
      {name:'Technical Exercises',duration:20,sub:'Targeted drills for current weakness: mix negotiation, belt placement, onset control'},
      {name:'Agility & Riff Practice',duration:10,sub:'Pentatonic runs, melisma patterns, increasing speed. Clean each note.'},
      {name:'Break',duration:5,sub:'Rest voice, hydrate, light stretching'},
      {name:'Song Work',duration:30,sub:'Work on 2-3 songs. Isolate difficult phrases. Apply technique from drills.'},
      {name:'Performance Practice',duration:15,sub:'Full run-throughs with emotion, movement, microphone technique'},
      {name:'Recording & Review',duration:15,sub:'Record final run. Listen back critically. Note areas for improvement.'},
    ],
    schedule: [
      {day:'Monday',focus:'Mix Voice & Ballads',detail:'Focus on smooth registration through the bridge. Gentle dynamic control.'},
      {day:'Tuesday',focus:'Belt & Rock Styles',detail:'Chest-dominant mix, twang, and call register. High-energy delivery.'},
      {day:'Wednesday',focus:'Riffs & Agility',detail:'Melismatic passages, pentatonic runs, gospel-style embellishments.'},
      {day:'Thursday',focus:'Stamina & Simulation',detail:'Sing full set (30-45 min continuous). Build endurance and stage presence.'},
      {day:'Friday',focus:'Recording & Critique',detail:'Record 2-3 full takes. Compare to reference. Identify specific improvements.'},
      {day:'Saturday',focus:'Live Rehearsal',detail:'Perform for an audience (friends, open mic, or camera). Full performance mode.'},
      {day:'Sunday',focus:'Light / Rest',detail:'Gentle warm-up only if needed. Review notes from the week. Plan next week.'},
    ],
    zones: [
      {range:'G2\u2013B2',label:'Low Support Zone',desc:'Engage chest resonance, maintain airflow. Avoid pushing\u2014let the note sit.'},
      {range:'C3\u2013G3',label:'Main Comfortable Zone',desc:'Full chest voice with natural resonance. Focus on clarity and tone quality.'},
      {range:'A3\u2013D4',label:'Bridge / Mix Zone',desc:'Transition area. Tilt thyroid cartilage, narrow vowels slightly, maintain airflow.'},
      {range:'E4+',label:'Light Head Voice',desc:'Allow the voice to lighten. Support from below, resonance in the mask. No pushing.'},
    ],
    progression: [
      {title:'Weeks 1\u20132',items:['Establish daily routine without strain','Smooth 1.5-octave range with even tone','Basic mix negotiation at moderate volume','Record baseline for comparison']},
      {title:'Weeks 3\u20134',items:['Extend usable range by 2-3 semitones','Riffs at moderate tempo (80 BPM 16ths)','One song performance-ready','Dynamic control: pp to mf without breaks']},
      {title:'Weeks 5\u20136',items:['Consistent mix through bridge (A3\u2013D4)','Riffs at 100 BPM 16ths','Belt up to target note with good placement','Two songs performance-ready with dynamics']},
      {title:'Weeks 7\u20138',items:['Full 2+ octave usable range','Agility patterns fluid and musical','Complete 30-min set without fatigue','Record final evaluation and compare to baseline']},
    ],
    technique: [
      {title:'Posture',body:'Stand with feet shoulder-width, knees soft, pelvis neutral. Spine tall, shoulders relaxed and back. Head balanced on top of spine\u2014no forward jut.'},
      {title:'Breath Support',body:'Inhale low into belly and back ribs. On exhale, engage lower abs inward and upward\u2014steady, controlled airstream. Avoid clavicular breathing.'},
      {title:'Open Relaxed Throat',body:'Low larynx (natural, not forced down). Soft palate lifted as in a yawn. Jaw released and dropped. Tongue forward and flat, tip behind lower teeth.'},
      {title:'Onsets',body:'Coordinate breath and cord closure simultaneously for clean onset. Avoid breathy (H) or glottal (hard attack) starts. Aim for balanced onset.'},
      {title:'Mix & Bridge',body:'As you ascend, allow thyroid tilt and gradual shift of resonance from chest to head. Maintain consistent airflow. Narrow vowels slightly in the bridge zone.'},
      {title:'Vowel Shaping',body:'Modify vowels as pitch rises (e.g., open "ah" \u2192 rounder "aw" above the bridge). This prevents strain and maintains tone quality in upper range.'},
      {title:'No Strain Rule',body:'If you feel tension, constriction, or pain\u2014stop and reset. Reduce volume, lower the key, or simplify the passage. Pushing through strain causes damage.'},
      {title:'Hydration & Rest',body:'Drink water throughout (room temp). Avoid caffeine/alcohol before singing. Rest voice 10-15 min after heavy sessions. Sleep 7-8 hours for vocal recovery.'},
    ],
  },
};

let curTimer = null;
let curTimerState = {running:false, blockIdx:0, remaining:0, currName:''};

export function initCurriculum() {
  const tabsEl = document.getElementById('cur-tabs');
  tabsEl.innerHTML = '';
  Object.keys(CURRICULA).forEach((key, i) => {
    const btn = document.createElement('button');
    btn.className = 'cur-tab' + (i === 0 ? ' active' : '');
    btn.textContent = CURRICULA[key].label;
    btn.onclick = () => {
      tabsEl.querySelectorAll('.cur-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      stopSession();
      renderCurriculum(key);
    };
    tabsEl.appendChild(btn);
  });
  renderCurriculum('guitar');
}

function renderCurriculum(name) {
  const c = CURRICULA[name];
  const el = document.getElementById('cur-content');
  curTimerState.currName = name;
  let html = '';

  html += `<div class="cur-section-title">Session Structure (${c.daily})</div>`;
  html += `<div id="cur-blocks">`;
  c.blocks.forEach((b, i) => {
    html += `<div class="session-block" id="cur-block-${i}">`;
    html += `<span class="block-name">${b.name}${b.sub ? '<br><small style="color:var(--muted)">'+b.sub+'</small>':''}</span>`;
    html += `<span class="dur-badge">${b.duration} min</span>`;
    html += `</div>`;
  });
  html += `</div>`;

  const links = c.blocks.filter(b => b.link);
  if (links.length) {
    html += `<div style="margin:10px 0">`;
    links.forEach(b => {
      html += `<button class="cur-crosslink" onclick="showSection('${b.link}')">${b.linkLabel} \u2192</button>`;
    });
    html += `</div>`;
  }

  html += `<div class="timer-display" id="cur-timer">`;
  html += `<div class="timer-time" id="cur-timer-time">00:00</div>`;
  html += `<div class="timer-label" id="cur-timer-label">Press Start to begin session</div>`;
  html += `</div>`;
  html += `<div class="timer-controls">`;
  html += `<button class="btn primary" onclick="startSession('${name}')">Start Session</button>`;
  html += `<button class="btn" onclick="stopSession()">Stop</button>`;
  html += `</div>`;

  if (c.schedule) {
    html += `<div class="cur-section-title">Weekly Schedule</div>`;
    html += `<table class="schedule-table"><tr><th>Day</th><th>Focus</th>`;
    if (c.schedule[0].duration) html += `<th>Duration</th>`;
    html += `<th>Details</th></tr>`;
    c.schedule.forEach(s => {
      html += `<tr><td>${s.day}</td><td>${s.focus}</td>`;
      if (s.duration) html += `<td>${s.duration}</td>`;
      html += `<td>${s.detail}</td></tr>`;
    });
    html += `</table>`;
  }

  if (c.zones) {
    html += `<div class="cur-section-title">Voice Zones</div>`;
    html += `<table class="schedule-table"><tr><th>Range</th><th>Zone</th><th>Notes</th></tr>`;
    c.zones.forEach(z => {
      html += `<tr><td>${z.range}</td><td>${z.label}</td><td>${z.desc}</td></tr>`;
    });
    html += `</table>`;
  }

  if (c.progression) {
    html += `<div class="cur-section-title">Progression</div>`;
    c.progression.forEach(p => {
      html += `<div class="collapsible"><div class="collapsible-head" onclick="toggleCollapsible(this.parentElement)">${p.title}</div>`;
      html += `<div class="collapsible-body"><ul>${p.items.map(it => `<li>${it}</li>`).join('')}</ul></div></div>`;
    });
  }

  if (c.technique) {
    html += `<div class="cur-section-title">Technique Notes</div>`;
    c.technique.forEach(t => {
      html += `<div class="collapsible"><div class="collapsible-head" onclick="toggleCollapsible(this.parentElement)">${t.title}</div>`;
      html += `<div class="collapsible-body"><p>${t.body}</p></div></div>`;
    });
  }

  el.innerHTML = html;
}

function toggleCollapsible(el) {
  el.classList.toggle('open');
}
window.toggleCollapsible = toggleCollapsible;

function startSession(currName) {
  stopSession();
  const c = CURRICULA[currName];
  if (!c) return;
  curTimerState = {running:true, blockIdx:0, remaining:c.blocks[0].duration*60, currName};
  updateTimerUI();
  highlightBlock(0, c.blocks.length);
  curTimer = setInterval(() => {
    if (!curTimerState.running) return;
    curTimerState.remaining--;
    if (curTimerState.remaining <= 0) {
      markBlockDone(curTimerState.blockIdx);
      playBeep();
      curTimerState.blockIdx++;
      const c2 = CURRICULA[curTimerState.currName];
      if (curTimerState.blockIdx >= c2.blocks.length) {
        stopSession();
        document.getElementById('cur-timer-label').textContent = 'Session complete!';
        return;
      }
      curTimerState.remaining = c2.blocks[curTimerState.blockIdx].duration * 60;
      highlightBlock(curTimerState.blockIdx, c2.blocks.length);
    }
    updateTimerUI();
  }, 1000);
}
window.startSession = startSession;

export function stopSession() {
  if (curTimer) { clearInterval(curTimer); curTimer = null; }
  curTimerState.running = false;
}
window.stopSession = stopSession;

function updateTimerUI() {
  const m = Math.floor(curTimerState.remaining / 60);
  const s = curTimerState.remaining % 60;
  const timeEl = document.getElementById('cur-timer-time');
  const labelEl = document.getElementById('cur-timer-label');
  if (timeEl) timeEl.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  if (labelEl) {
    const c = CURRICULA[curTimerState.currName];
    if (c && c.blocks[curTimerState.blockIdx]) {
      labelEl.textContent = c.blocks[curTimerState.blockIdx].name;
    }
  }
}

function highlightBlock(idx, total) {
  for (let i = 0; i < total; i++) {
    const el = document.getElementById('cur-block-' + i);
    if (el) {
      el.classList.remove('active');
      if (i < idx) el.classList.add('done');
    }
  }
  const cur = document.getElementById('cur-block-' + idx);
  if (cur) cur.classList.add('active');
}

function markBlockDone(idx) {
  const el = document.getElementById('cur-block-' + idx);
  if (el) { el.classList.remove('active'); el.classList.add('done'); }
}

function playBeep() {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 660;
  gain.gain.value = 0.3;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}
