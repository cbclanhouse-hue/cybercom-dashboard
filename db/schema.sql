CREATE DATABASE IF NOT EXISTS cybercom_dashboard;
USE cybercom_dashboard;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee'
);

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service_id INT NOT NULL,
  service_name VARCHAR(150) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  date DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(100) NOT NULL,
  date DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO users (username, password, role) VALUES
('admin', '123', 'admin')
ON DUPLICATE KEY UPDATE username = username;

INSERT INTO services (name, price) VALUES
('Instalação de Antena', 150.00),
('Manutenção de Rede', 250.00)
ON DUPLICATE KEY UPDATE name = name;
