from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf

MODEL_PATH = Path(__file__).resolve().parent / "asl_mediapipe_mlp_model.h5"

# LabelEncoder sorts these classes as A-Z, del, and space.
LABELS = tuple("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ("DELETE", "SPACE")


class SentenceBuilder:
    def __init__(self, required_frames=18, threshold=0.7):
        self.required_frames = required_frames
        self.threshold = threshold
        self.sentence = ""
        self.last_label = None
        self.stable_count = 0
        self.waiting_for_release = False

    def update(self, label, confidence=0.0):
        if not label:
            self.last_label = None
            self.stable_count = 0
            self.waiting_for_release = False
            return self.sentence
        if confidence < self.threshold:
            self.last_label = None
            self.stable_count = 0
            return self.sentence
        self.stable_count = self.stable_count + 1 if label == self.last_label else 1
        self.last_label = label

        # Add a character once, then wait for the hand to leave the frame.
        if self.stable_count >= self.required_frames and not self.waiting_for_release:
            if label == "SPACE":
                self.sentence += " "
            elif label == "DELETE":
                self.sentence = self.sentence[:-1]
            else:
                self.sentence += label
            self.waiting_for_release = True
            self.stable_count = 0
        return self.sentence


class SignRecognizer:
    def __init__(self):
        self.model = tf.keras.models.load_model(MODEL_PATH, compile=False)
        if self.model.input_shape[-1] != 63 or self.model.output_shape[-1] != len(LABELS):
            raise ValueError("Expected 63 landmark features and 28 output classes.")
        self.hands = mp.solutions.hands.Hands(
            static_image_mode=False, max_num_hands=1,
            min_detection_confidence=0.7, min_tracking_confidence=0.7,
        )
        self.builder = SentenceBuilder()

    def process(self, frame):
        frame = cv2.flip(frame, 1)
        results = self.hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        label, confidence = "", 0.0
        if results.multi_hand_landmarks:
            hand = results.multi_hand_landmarks[0]
            features = np.array(
                [[point.x, point.y, point.z] for point in hand.landmark],
                dtype=np.float32,
            ).reshape(1, 63)
            # Preserve the app's existing coordinate convention; handedness
            # mirroring needs validation against live samples before changing it.
            scores = self.model(features, training=False).numpy()[0]
            index = int(np.argmax(scores))
            label, confidence = LABELS[index], float(scores[index])
            mp.solutions.drawing_utils.draw_landmarks(
                frame, hand, mp.solutions.hands.HAND_CONNECTIONS,
            )
        sentence = self.builder.update(label, confidence)
        cv2.putText(frame, f"Sign: {label or '-'} ({confidence:.0%})", (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        cv2.putText(frame, f"Sentence: {sentence}", (30, 95),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        return frame, {"prediction": label, "confidence": confidence, "sentence": sentence}

    def close(self):
        self.hands.close()


def open_camera(index=0):
    camera = cv2.VideoCapture(index)
    if not camera.isOpened():
        camera.release()
        raise RuntimeError(
            f"Cannot open camera {index}. Check macOS camera permissions, "
            "close other camera apps, or try --camera 1."
        )
    return camera
