# General scenes and ready-to-export defaults

Implement the user's requested book-free scenes in the existing shared browser/CLI/CPU engine. New projects default to two v12 people, beady then regular eyes, with no product book or endcard. Preserve explicit old models and book templates.

Builder choices: add conversation, greeting and button-interaction templates. Conversation starts with an empty row per actor. Each absent/whitespace-only dialogue text becomes a two-second silent hold on its actor (ordinary gestures and facial controls still work), no speech synthesis or captions. Empty line arrays produce a two-second hold on the first actor. Authored speech, recordings and action durations keep existing timing. Blank text with a recording must still use that recording. Invalid non-string text remains an error. Book templates retain source/transition validation; a silent row counts as visual coverage of its selected page.

General templates declare zero required comics and book:false. They neither load nor display the book, generate automatic book shots, nor add a product card. Book/source shots and book actions require a book template. Keep cast IDs reader/friend for compatibility. General template presets expose a usable scene/cast/action sequence when selected without editing. Button interaction uses a visible procedural pedestal/button with an actual hand reach and button movement; it is evaluated in shared JS for WebGL and Blender.

Import the current v12 regular/beady GLBs from ../goosnav-3D-assets, keeping source paths/hashes and old assets. Inspect mouth/jaw rig compatibility and adapt existing actor performance rather than overlaying a false mouth. Verify real model output, including speech. Do not edit the asset library. Preserve existing uncommitted audio security changes.

Validation: baseline and focused regressions; actual untouched GUI export, silent/spoken general scenes, button action, legacy book scene, real Blender CPU general output, production build. Verify streams/duration/dimensions and inspect images. No deployment; this task does not need to push unless requested.
