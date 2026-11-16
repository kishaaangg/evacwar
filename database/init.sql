
CREATE DATABASE IF NOT EXISTS evac_system;
USE evac_system;



CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff', 'barangay_council', 'resident') NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL, 
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_logs_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS residents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) DEFAULT NULL,
    last_name VARCHAR(100) NOT NULL,
    sex ENUM('Male', 'Female') DEFAULT 'Male',
    birthdate DATE DEFAULT NULL,
    age INT DEFAULT NULL,
    contact_number VARCHAR(20) NOT NULL,
    home_address TEXT NOT NULL,
    barangay VARCHAR(100) DEFAULT 'San Rafael',
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    vulnerability VARCHAR(100) DEFAULT 'None',
    family_size INT DEFAULT 1,
    has_special_needs BOOLEAN DEFAULT FALSE,
    is_4ps BOOLEAN DEFAULT FALSE,
    is_pregnant BOOLEAN DEFAULT FALSE,
    is_lactating BOOLEAN DEFAULT FALSE,
    is_pwd BOOLEAN DEFAULT FALSE,
    is_single_head BOOLEAN DEFAULT FALSE,
    has_serious_illness BOOLEAN DEFAULT FALSE,
    serious_illness_details VARCHAR(255) DEFAULT NULL,
    profile_photo VARCHAR(255) DEFAULT NULL,
    qr_code_uuid VARCHAR(36) NOT NULL UNIQUE,

    CONSTRAINT fk_resident_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) DEFAULT NULL,
    last_name VARCHAR(100) NOT NULL,
    occupation VARCHAR(100) DEFAULT 'Emergency Staff',
    staff_type ENUM('EVACUATION', 'RESCUER', 'BOTH') DEFAULT 'BOTH',
    assigned_center_id INT DEFAULT NULL,
    contact_number VARCHAR(20) DEFAULT NULL,
    profile_photo VARCHAR(255) DEFAULT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'ON_DUTY', 'OFF_DUTY') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_staff_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_staff_center
        FOREIGN KEY (assigned_center_id)
        REFERENCES evacuation_centers(id)
        ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS household_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resident_id INT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) DEFAULT NULL,
    last_name VARCHAR(100) NOT NULL,
    relation VARCHAR(50) DEFAULT 'Family',
    sex ENUM('Male', 'Female') DEFAULT 'Male',
    birthdate DATE DEFAULT NULL,
    age INT DEFAULT 0,
    status VARCHAR(255) DEFAULT NULL,
    is_pregnant BOOLEAN DEFAULT FALSE,
    is_lactating BOOLEAN DEFAULT FALSE,
    is_pwd BOOLEAN DEFAULT FALSE,
    has_serious_illness BOOLEAN DEFAULT FALSE,
    serious_illness_details VARCHAR(255) DEFAULT NULL,

    CONSTRAINT fk_hm_resident
        FOREIGN KEY (resident_id)
        REFERENCES residents(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS evacuation_centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    max_capacity INT NOT NULL,
    current_occupancy INT DEFAULT 0,
    status ENUM('OPEN', 'FULL', 'CLOSED') DEFAULT 'OPEN'
);


CREATE TABLE IF NOT EXISTS check_ins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resident_id INT,
    household_member_id INT DEFAULT NULL,
    center_id INT,
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP NULL,
    status ENUM('ACTIVE', 'DEPARTED', 'CHECKED_IN', 'CHECKED_OUT') DEFAULT 'ACTIVE',
    check_in_method ENUM('QR', 'MANUAL') DEFAULT 'QR',
    staff_user_id INT,

    CONSTRAINT fk_checkin_resident
        FOREIGN KEY (resident_id)
        REFERENCES residents(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_checkin_member
        FOREIGN KEY (household_member_id)
        REFERENCES household_members(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_checkin_center
        FOREIGN KEY (center_id)
        REFERENCES evacuation_centers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_checkin_staff
        FOREIGN KEY (staff_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'BLUE',
    broadcast_type ENUM('SMS', 'IN_APP', 'BOTH') NOT NULL DEFAULT 'SMS',
    target_audience VARCHAR(100) DEFAULT 'ALL',
    barangay VARCHAR(100) DEFAULT NULL,
    recipient_count INT DEFAULT 0,
    valid_phone_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'MOCK_SENT',
    message_id VARCHAR(255) DEFAULT NULL,
    delivery_report TEXT DEFAULT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_alert_sender
        FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS sos_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resident_id INT DEFAULT NULL,
    name VARCHAR(150) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(8, 2) DEFAULT 0,
    status ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING', 'RESCUED', 'RESOLVED', 'CANCELLED') DEFAULT 'ACTIVE',
    handled_by INT DEFAULT NULL,
    responder_notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sos_handled_user
        FOREIGN KEY (handled_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS weather_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    weather_status VARCHAR(100), -- e.g. Rain, Storm, Sunny
    wind_speed DECIMAL(5,2), -- km/h
    wind_gusts DECIMAL(5,2), -- km/h peak gusts
    rainfall DECIMAL(5,2), -- mm
    temperature DECIMAL(5,2), -- °C
    pressure DECIMAL(6,2), -- hPa barometric pressure
    humidity INT, -- % relative humidity
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS map_settings (
    key_name VARCHAR(50) PRIMARY KEY,
    value LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

