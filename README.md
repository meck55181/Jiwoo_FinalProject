# Final Project: Word Drift

An interactive project about what happens when we become distant from another person’s words.

## Concept

When my attention moves away from someone, their words can feel distant. 
I may hear them, but I may not fully understand what they are trying to say. 
I wanted to express this distance by making language physically scatter across a screen.

The project turns the filled dots of Braille letters into small white circles. 
When the viewer is close to the ultrasonic sensor, the circles gather into readable Braille patterns. 
When the viewer moves farther away, the circles drift apart and bounce around the canvas like atoms.

I chose sign language as the input method because expressing something can take courage, patience, and time. 
The user must hold a hand sign steady and wait for the system to recognize it. 
After each letter, the user must move their hand out of the camera frame before entering the next one. 
This pause is part of the interaction: communication requires attention and waiting from both sides.

The project recognizes ASL fingerspelled letters.

## How It Works

### 1. Enter a letter using the webcam

The webcam captures the user’s hand. MediaPipe detects 21 hand landmarks, and the MLP model uses their x, y, and z coordinates to predict a label.

The model can predict the letters A–Z, SPACE, and DELETE. A prediction is accepted only when its confidence reaches 0.7 and the same sign is detected for 18 consecutive frames. This helps prevent a brief or uncertain prediction from being added to the sentence.

After a character is entered, the system waits for the hand to leave the camera frame. This release allows the user to enter the next character without repeating the same sign by accident. SPACE adds a space, and DELETE removes the last character.

### 2. Turn the sentence into Braille

The browser converts each recognized letter into its Unicode Braille pattern. Each filled Braille dot is drawn as a white circle on the canvas. Spaces remain blank cells between letters.

The layout adjusts to the canvas size so the sentence can fit in the available area. When a letter is added, the circles move toward their new Braille positions.

### 3. Use the ultrasonic sensor to change the words

The ESP32 sends distance readings to the browser over USB serial communication. When the sensor detects an object within 30 cm, the circles move toward their Braille positions. When the object is farther than 30 cm, the circles move freely and bounce off the canvas edges.

If no valid distance reading arrives for two seconds, the interface displays “No sensor signal” and the circles continue moving freely. When the sensor is disconnected, the circles return to the readable Braille layout.

## Instructions

### Software Setup

   ```
   python3 -m venv .venv
   source .venv/bin/activate
   python3 -m pip install -r requirements.txt
   python3 app.py
   ```

### Connect the ESP32 Sensor
1. Upload the project’s esp32_ultrasonic.ino sketch to the ESP32.
2. In the website, click Connect Sensor and select the ESP32 serial port.
3. Place an object in front of the ultrasonic sensor and move it closer than or farther than 30 cm.

### Sensor Wiring
This project uses an `HC-SR04 ultrasonic sensor` with a `FireBeetle 2 ESP32-E`.
- HC-SR04 VCC → board VCC
- HC-SR04 GND → board GND
- TRIG → ESP32 GPIO26 (D3)
- ECHO → a voltage divider, then ESP32 GPIO18 (SCK)

## Reflection

One challenge was preventing unstable predictions from adding unintended letters. The confidence threshold, frame requirement, and hand-release step make input more deliberate, but also make it slower. The system is limited to ASL fingerspelling and depends on camera conditions and the model’s predictions. It does not understand sign language grammar or translate complete signed sentences.

With more time, I would test the recognizer with more users and lighting conditions, improve the sensor feedback, and explore how pauses between letters affect the audience’s experience.

## Files

- `app.py`
- `recognition.py`
- `asl_mediapipe_mlp_model.h5`
- `requirements.txt`

- `static/app.mjs`
- `static/particles.mjs`
- `static/style.css`

- `templates/index.html`


## Documentation

[close-image](documentation/final-photo1.png)
[far-image](documentation/final-photo2.png)

[full-video](documentation/final-video1.mp4)
[screen-recording](documentation/final-video2.mp4)

## Attribution

### Third-Party Resources
- The asl_mediapipe_mlp_model.h5 file was sourced from the [Sign Language Recognition System](https://github.com/JaspreetSingh-exe/Sign-Language-Recognition-System) repository by Jaspreet Singh. I did not train this model for this project. The repository provides an MIT license; the included LICENSE file retains the original copyright and license notice.
- I consulted [particles.js](https://github.com/VincentGarreau/particles.js/?utm_source=chatgpt.com) by Vincent Garreau as a visual reference for the general idea of animated particles.
- The project also uses Flask, OpenCV, MediaPipe, TensorFlow, and NumPy. Their packages are listed in requirements.txt.

### Use of AI
I used AI assistance to draft, explain, and refine parts of the code:
- In app.py, AI helped with organizing the Flask routes, camera-processing thread, and MJPEG video stream.
- In recognition.py, AI helped explain and document the landmark-processing and stable-character-entry logic.
- In static/app.mjs, AI helped with browser-side camera updates and Web Serial input.
- In static/particles.mjs, AI helped with particle movement.
