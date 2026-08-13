# Pitch Trainer Improvement — Manual Device Checklist

**Status:** All items below are **unchecked / untested** unless a tester marks them
after a real run on that device and context.

Do not claim a device passed unless it was tested.

## Android Chrome

- [ ] Built-in mic — Trainer Center task, straight tone, quiet room
- [ ] Built-in mic — Trainer Center task, straight tone, noisy room
- [ ] Built-in mic — Trainer vibrato style
- [ ] Built-in mic — Pitch Runner melody
- [ ] Built-in mic — Tuner with headphones
- [ ] Built-in mic — Tuner with speakers (guide/reference)
- [ ] External USB mic — Trainer
- [ ] External USB mic — Runner
- [ ] Headphones — Trainer with guide tone
- [ ] Speakers — Trainer with guide tone (scoring lockout)
- [ ] Chest register (low range preset)
- [ ] Mix register (mid range preset)
- [ ] Head register (high range preset)
- [ ] Unpitched input shows "No stable fundamental"
- [ ] Mic denial — Start stays enabled; retry works after grant
- [ ] Stop releases mic (no stuck indicator / other app blocked)

## Desktop Chrome

- [ ] Built-in mic — Trainer Center task, straight tone, quiet room
- [ ] Built-in mic — Trainer Center task, straight tone, noisy room
- [ ] Built-in mic — Trainer vibrato style
- [ ] Built-in mic — Pitch Runner melody
- [ ] Built-in mic — Tuner with headphones
- [ ] Built-in mic — Tuner with speakers (guide/reference)
- [ ] External mic — Trainer
- [ ] External mic — Runner
- [ ] Headphones — Trainer with guide tone
- [ ] Speakers — Trainer with guide tone (scoring lockout)
- [ ] Chest register (low range preset)
- [ ] Mix register (mid range preset)
- [ ] Head register (high range preset)
- [ ] Unpitched input shows "No stable fundamental"
- [ ] Mic denial — Start stays enabled; retry works after grant
- [ ] Stop releases mic (no stuck indicator / other app blocked)
- [ ] Worklet + Worker capture path loads over HTTP (no console errors)
- [ ] Background tab — capture continues (audio graph stays alive)

## Cross-tool exclusivity

- [ ] Starting Trainer stops Tuner mic
- [ ] Starting Runner stops Trainer mic
- [ ] Starting Tuner stops Trainer and Runner mic

## Performance (informal)

- [ ] No visible UI jank during Trainer sustain (low notes)
- [ ] No audio output glitches during guide tone + singing
