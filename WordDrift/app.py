import argparse
import logging
import threading

import cv2
from flask import Flask, Response, render_template, jsonify

from recognition import SignRecognizer, open_camera

app = Flask(__name__)
frame_condition = threading.Condition()
latest_jpeg = None
frame_version = 0
stop_event = threading.Event()
camera_error = None
latest_prediction = {"prediction": "", "confidence": 0.0, "sentence": ""}
camera_active = False


def recognize_sign(camera, recognizer):
    global latest_jpeg, frame_version, camera_error, latest_prediction, camera_active
    try:
        failed_reads = 0
        while not stop_event.is_set():
            success, frame = camera.read()
            if not success:
                failed_reads += 1
                if failed_reads >= 30:
                    raise RuntimeError("카메라 영상을 읽을 수 없습니다. 다른 카메라 앱을 종료한 뒤 서버를 다시 실행해주세요.")
                stop_event.wait(0.1)
                continue
            failed_reads = 0
            frame, data = recognizer.process(frame)
            with frame_condition:
                latest_prediction = dict(data)
                camera_active = True
            success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if success:
                with frame_condition:
                    latest_jpeg = buffer.tobytes()
                    frame_version += 1
                    frame_condition.notify_all()
            stop_event.wait(0.03)
    except Exception as error:
        logging.exception("Camera recognition stopped")
        with frame_condition:
            camera_error = str(error)
            camera_active = False
    finally:
        camera.release()
        recognizer.close()
        stop_event.set()
        with frame_condition:
            frame_condition.notify_all()


def generate_frames():
    version = -1
    while True:
        with frame_condition:
            frame_condition.wait_for(lambda: frame_version != version or stop_event.is_set())
            if stop_event.is_set():
                return
            jpeg, version = latest_jpeg, frame_version
        if jpeg is not None:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/video_feed")
def video_feed():
    if camera_error or stop_event.is_set():
        return Response("Camera is not active.", status=503, mimetype="text/plain")
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/state")
def state():
    with frame_condition:
        data = dict(latest_prediction, camera_active=camera_active, camera_error=camera_error)
    response = jsonify(data)
    response.headers["Cache-Control"] = "no-store"
    return response


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--no-camera", action="store_true", help="Test particles and USB sensor without opening the camera")
    args = parser.parse_args()
    if args.no_camera:
        global camera_error
        camera_error = "카메라 없이 실행 중"
        app.run(host="127.0.0.1", port=args.port, debug=False,
                use_reloader=False, threaded=True)
        return
    recognizer = SignRecognizer()
    try:
        camera = open_camera(args.camera)
    except Exception:
        recognizer.close()
        raise
    worker = threading.Thread(target=recognize_sign, args=(camera, recognizer), daemon=True)
    worker.start()
    print(f"Camera opened. Visit http://127.0.0.1:{args.port}; Ctrl+C to stop.")
    try:
        app.run(host="127.0.0.1", port=args.port, debug=False,
                use_reloader=False, threaded=True)
    finally:
        stop_event.set()
        with frame_condition:
            frame_condition.notify_all()
        worker.join(timeout=5)


if __name__ == "__main__":
    main()
