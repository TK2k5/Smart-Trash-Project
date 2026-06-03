#include <CheapStepper.h>
#include <Servo.h>

Servo servo1;

// ================= PIN DEFINE =================
#define ir 5
#define proxi 6
#define buzzer 12

// ================= SENSOR =================
int potPin = A0;
int soil = 0;
int fsoil = 0;

// ================= SERVO =================
int openAngle = 0;
int closeAngle = 180;

// ================= STEPPER =================
CheapStepper stepper(11,10,9,8);

// ================= COUNTER =================
int metalCount = 0;
int wetCount = 0;
int dryCount = 0;

// =====================================================
// SEND JSON FUNCTION
// =====================================================
void sendJSON(String type, int moisture)
{
  Serial.print("{");

  Serial.print("\"type\":\"");
  Serial.print(type);
  Serial.print("\"");

  Serial.print(",\"moisture\":");
  Serial.print(moisture);

  Serial.print(",\"metalCount\":");
  Serial.print(metalCount);

  Serial.print(",\"wetCount\":");
  Serial.print(wetCount);

  Serial.print(",\"dryCount\":");
  Serial.print(dryCount);

  Serial.println("}");
}

// =====================================================
// SERVO FUNCTION
// =====================================================
void moveServo()
{
  Serial.println("{\"event\":\"servo_open\"}");

  servo1.attach(7);

  // OPEN
  servo1.write(openAngle);
  delay(1500);

  Serial.println("{\"event\":\"servo_close\"}");

  // CLOSE
  servo1.write(closeAngle);
  delay(1500);

  // STOP PWM
  servo1.detach();

  Serial.println("{\"event\":\"servo_stop\"}");
}

// =====================================================
// SETUP
// =====================================================
void setup()
{
  Serial.begin(9600);

  // ===== PIN MODE =====
  pinMode(proxi, INPUT_PULLUP);
  pinMode(ir, INPUT);
  pinMode(buzzer, OUTPUT);

  // ===== SERVO START POSITION =====
  servo1.attach(7);
  servo1.write(closeAngle);
  delay(2000);
  servo1.detach();

  // ===== STEPPER =====
  stepper.setRpm(17);

  // ===== SYSTEM START =====
  Serial.println("{\"system\":\"started\"}");
}

// =====================================================
// LOOP
// =====================================================
void loop()
{
  fsoil = 0;

  // ===== READ SENSOR =====
  int proxiState = digitalRead(proxi);
  int irState = digitalRead(ir);

  // =================================================
  // METAL / PROXIMITY DETECTION
  // =================================================
  if(proxiState == 0)
  {
    metalCount++;

    Serial.println("{\"event\":\"metal_detected\"}");

    sendJSON("metal", 0);

    tone(buzzer, 1000, 1000);

    // STEP MOTOR
    stepper.moveDegreesCCW(240);

    delay(2000);

    // SERVO
    moveServo();

    delay(1000);

    // RETURN
    stepper.moveDegreesCW(240);

    delay(2000);
  }

  // =================================================
  // IR DETECTION
  // =================================================
  if(irState == 0)
  {
    Serial.println("{\"event\":\"trash_detected\"}");

    tone(buzzer, 1000, 500);

    delay(1000);

    // ===== READ SOIL 3 TIMES =====
    for(int i=0; i<3; i++)
    {
      soil = analogRead(potPin);

      soil = constrain(soil, 485, 1023);

      fsoil = map(soil, 485, 1023, 100, 0) + fsoil;

      delay(75);
    }

    // ===== AVERAGE =====
    fsoil = fsoil / 3;

    // =============================================
    // WET TRASH
    // =============================================
    if(fsoil > 20)
    {
      wetCount++;

      Serial.println("{\"event\":\"wet_detected\"}");

      sendJSON("wet", fsoil);

      stepper.moveDegreesCW(240);

      delay(2000);

      moveServo();

      delay(1000);

      stepper.moveDegreesCCW(240);

      delay(2000);
    }

    // =============================================
    // DRY TRASH
    // =============================================
    else
    {
      dryCount++;

      Serial.println("{\"event\":\"dry_detected\"}");

      sendJSON("dry", fsoil);

      tone(buzzer, 1000, 500);

      delay(1000);

      moveServo();

      delay(1000);
    }
  }

  // LOOP DELAY
  delay(300);
}