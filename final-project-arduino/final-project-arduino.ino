const int TRIG = 26;
const int ECHO = 18;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  digitalWrite(TRIG, LOW);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  unsigned long duration = pulseIn(ECHO, HIGH, 25000);
  float distance = duration * 0.0343 / 2;

  if (duration > 0 && distance >= 2 && distance <= 400) {
    Serial.println(distance, 1);
  } else {
    Serial.println("null");
  }

  delay(70);
}