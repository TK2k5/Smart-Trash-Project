# Smart Trash IoT - Hệ Thống Thùng Rác Thông Minh Phân Loại Tự Động

## 1. Giới thiệu

Smart Trash IoT là hệ thống thùng rác thông minh có khả năng tự động nhận diện và phân loại rác thành nhiều nhóm khác nhau nhằm hỗ trợ việc thu gom, tái chế và xử lý chất thải hiệu quả hơn.

Hệ thống sử dụng các cảm biến để xác định đặc tính của rác, kết hợp với động cơ Servo và Stepper Motor để điều hướng rác vào đúng ngăn chứa tương ứng. Dữ liệu phân loại được truyền về máy tính thông qua giao tiếp Serial dưới dạng JSON, cho phép tích hợp với Node-RED, Dashboard hoặc cơ sở dữ liệu để giám sát theo thời gian thực.

---

# 2. Mục tiêu đề tài

* Tự động hóa quá trình phân loại rác.
* Giảm sự can thiệp của con người.
* Hỗ trợ phân loại rác tại nguồn.
* Xây dựng hệ thống IoT có khả năng giám sát từ xa.
* Thu thập dữ liệu phục vụ thống kê và quản lý môi trường.

---

# 3. Chức năng chính

## 3.1 Phát hiện rác kim loại

Hệ thống sử dụng cảm biến tiệm cận (Proximity Sensor) để nhận biết vật thể kim loại.

Khi phát hiện kim loại:

* Kích hoạt còi báo.
* Tăng bộ đếm rác kim loại.
* Gửi dữ liệu lên hệ thống giám sát.
* Quay Stepper Motor sang vị trí chứa rác kim loại.
* Mở nắp bằng Servo để thả rác.
* Đưa cơ cấu trở về vị trí ban đầu.

---

## 3.2 Phát hiện rác thông thường

Cảm biến hồng ngoại (IR Sensor) được sử dụng để phát hiện khi có vật thể đi vào khu vực phân loại.

Sau khi phát hiện:

* Hệ thống kích hoạt còi báo.
* Đọc cảm biến độ ẩm 3 lần liên tiếp.
* Tính giá trị trung bình để giảm nhiễu.
* Thực hiện phân loại rác ướt hoặc rác khô.

---

## 3.3 Phân loại rác ướt

Nếu độ ẩm đo được lớn hơn 20%:

* Xác định là rác ướt.
* Tăng bộ đếm rác ướt.
* Gửi dữ liệu lên hệ thống.
* Quay Stepper Motor đến ngăn chứa rác ướt.
* Mở nắp thùng bằng Servo.
* Đưa cơ cấu phân loại về vị trí ban đầu.

---

## 3.4 Phân loại rác khô

Nếu độ ẩm nhỏ hơn hoặc bằng 20%:

* Xác định là rác khô.
* Tăng bộ đếm rác khô.
* Gửi dữ liệu lên hệ thống.
* Mở nắp thùng.
* Thả rác vào ngăn chứa mặc định.

---

## 3.5 Giám sát dữ liệu thời gian thực

Hệ thống xuất dữ liệu JSON thông qua cổng Serial.

Ví dụ:

```json
{
  "type":"wet",
  "moisture":45,
  "metalCount":2,
  "wetCount":5,
  "dryCount":3
}
```

Thông tin được gửi bao gồm:

* Loại rác vừa phát hiện.
* Độ ẩm đo được.
* Tổng số rác kim loại.
* Tổng số rác ướt.
* Tổng số rác khô.

---

# 4. Thành phần phần cứng

| Thiết bị               | Chức năng                |
| ---------------------- | ------------------------ |
| Arduino Uno            | Bộ điều khiển trung tâm  |
| IR Sensor              | Phát hiện vật thể        |
| Proximity Sensor       | Nhận diện kim loại       |
| Soil Moisture Sensor   | Đo độ ẩm rác             |
| Servo Motor SG90       | Đóng mở nắp thùng        |
| Stepper Motor 28BYJ-48 | Điều hướng rác           |
| Driver ULN2003         | Điều khiển Stepper Motor |
| Buzzer                 | Cảnh báo âm thanh        |
| Máy tính / Node-RED    | Giám sát dữ liệu         |

---

# 5. Sơ đồ nguyên lý hoạt động

```text
                RÁC ĐƯA VÀO
                       |
                       v
                IR SENSOR KIỂM TRA
                       |
                       v
        +------------------------------+
        |                              |
        |  Có phải kim loại ?          |
        | (Proximity Sensor)           |
        +------------------------------+
                 |             |
               Có             Không
                 |             |
                 v             v
         Ngăn kim loại    Đọc độ ẩm
                                |
                                v
                     +------------------+
                     | Độ ẩm > 20% ?    |
                     +------------------+
                           |      |
                         Có      Không
                           |      |
                           v      v
                    Ngăn rác ướt  Ngăn rác khô
```

---

# 6. Luồng hoạt động hệ thống

### Bước 1

Người dùng đưa rác vào cửa thùng.

### Bước 2

IR Sensor phát hiện vật thể.

### Bước 3

Proximity Sensor kiểm tra vật liệu kim loại.

### Bước 4

Nếu không phải kim loại, cảm biến độ ẩm được đọc 3 lần để lấy giá trị trung bình.

### Bước 5

Hệ thống xác định loại rác:

* Kim loại
* Rác ướt
* Rác khô

### Bước 6

Stepper Motor điều hướng máng phân loại.

### Bước 7

Servo mở nắp để đưa rác vào đúng ngăn chứa.

### Bước 8

Dữ liệu được gửi lên Dashboard hoặc Node-RED để giám sát.

---

# 7. Công nghệ sử dụng

## Phần cứng

* Arduino Uno
* Servo Motor
* Stepper Motor
* Cảm biến IR
* Cảm biến độ ẩm
* Cảm biến tiệm cận

## Phần mềm

* Arduino IDE
* Node-RED
* MQTT/HTTP (nếu mở rộng IoT)
* Dashboard giám sát
* Firebase Realtime Database (nếu triển khai Cloud)

---

# 8. Kết quả đạt được

* Tự động phân loại rác theo đặc tính vật lý.
* Thống kê số lượng từng loại rác.
* Hoạt động theo thời gian thực.
* Có khả năng tích hợp Dashboard IoT.
* Dễ mở rộng lên nền tảng Cloud.

---

# 9. Hướng phát triển

* Bổ sung cảm biến siêu âm để đo mức đầy thùng rác.
* Kết nối WiFi bằng ESP8266 hoặc ESP32.
* Lưu dữ liệu lên Firebase hoặc ThingsBoard.
* Ứng dụng Machine Learning để nhận diện nhiều loại rác hơn.
* Gửi cảnh báo khi thùng rác đầy.
* Xây dựng ứng dụng Web hoặc Mobile quản lý tập trung.

---
