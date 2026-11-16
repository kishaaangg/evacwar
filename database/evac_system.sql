-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 28, 2026 at 02:02 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET SESSION sql_require_primary_key = 0;

START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `evac_system`
--

-- --------------------------------------------------------

--
-- Table structure for table `alerts`
--

CREATE TABLE `alerts` (
  `id` int(11) NOT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `severity` varchar(50) NOT NULL DEFAULT 'BLUE',
  `broadcast_type` enum('SMS','IN_APP','BOTH') NOT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `target_audience` varchar(100) DEFAULT 'ALL',
  `barangay` varchar(100) DEFAULT NULL,
  `recipient_count` int(11) DEFAULT 0,
  `valid_phone_count` int(11) DEFAULT 0,
  `status` varchar(50) DEFAULT 'MOCK_SENT',
  `delivery_report` text DEFAULT NULL,
  `message_id` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `alerts`
--

INSERT INTO `alerts` (`id`, `sender_id`, `title`, `message`, `severity`, `broadcast_type`, `sent_at`, `target_audience`, `barangay`, `recipient_count`, `valid_phone_count`, `status`, `delivery_report`, `message_id`) VALUES
(10, 1, 'RED ALERT: Evacuation Test', 'EvakWar Broadcast Engine Live Test - Please confirm receipt.', 'RED', 'SMS', '2026-08-11 14:02:17', 'TEST_09278935759', 'San Rafael', 1, 1, 'QUEUED', '{\"mode\":\"LIVE\",\"provider\":\"iprogsms\",\"endpoint\":\"https://www.iprogsms.com/api/v1/sms_messages\",\"dispatchedAt\":\"2026-08-11T14:02:17.110Z\",\"totalTargeted\":1,\"validPhonesCount\":1,\"queuedCount\":1,\"failureCount\":0,\"status\":\"QUEUED\",\"primaryMessageId\":\"iSms-QMahTN\",\"messageIds\":[\"iSms-QMahTN\"],\"rawApiResponses\":[{\"phone\":\"639278935759\",\"success\":true,\"statusCode\":200,\"status\":\"QUEUED\",\"messageId\":\"iSms-QMahTN\",\"error\":\"SMS successfully queued for delivery.\",\"response\":{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-QMahTN\",\"message_status_link\":\"https://www.iprogsms.com/api/v1/sms_messages/status?api_token=12345&message_id=iSms-QMahTN\",\"message_status_request_mode\":\"GET\",\"sms_rate\":1},\"timestamp\":\"2026-08-11T14:02:16.101Z\"}]}', 'iSms-QMahTN'),
(11, 2, 'YELLOW ALERT: Severe Weather & Flood Watch', 'WEATHER WATCH: Heightened alert in Zone 1 due to rising flood waters. Stay indoors, monitor emergency channels, and avoid flooded areas.', 'YELLOW', 'SMS', '2026-08-11 14:03:21', 'ALL', 'Zone 1', 1, 1, 'MOCK_SENT', '{\"mode\":\"MOCK\",\"provider\":\"mock\",\"dispatchedAt\":\"2026-08-11T14:03:21.061Z\",\"totalTargeted\":1,\"validPhonesCount\":1,\"invalidCount\":0,\"segmentsPerMessage\":1,\"sampleRecipients\":[\"639998414123\"],\"status\":\"MOCK_SENT\"}', NULL),
(12, 2, 'ORANGE ALERT: Prepare for Immediate Evacuation', 'PRE-EVACUATION WARNING: Severe weather approaching Zone 1. Pack emergency go-bags, secure documents, and prepare for evacuation by 10:09 PM.', 'ORANGE', 'SMS', '2026-08-11 14:09:37', 'ALL', 'Zone 1', 1, 1, 'MOCK_SENT', '{\"mode\":\"MOCK\",\"provider\":\"mock\",\"dispatchedAt\":\"2026-08-11T14:09:37.093Z\",\"totalTargeted\":1,\"validPhonesCount\":1,\"invalidCount\":0,\"segmentsPerMessage\":1,\"sampleRecipients\":[\"639998414123\"],\"status\":\"MOCK_SENT\"}', NULL),
(13, 2, 'YELLOW ALERT: Severe Weather & Flood Watch', 'hi', 'YELLOW', 'SMS', '2026-08-11 14:10:41', 'ALL', 'Zone 1', 1, 1, 'MOCK_SENT', '{\"mode\":\"MOCK\",\"provider\":\"mock\",\"dispatchedAt\":\"2026-08-11T14:10:41.128Z\",\"totalTargeted\":1,\"validPhonesCount\":1,\"invalidCount\":0,\"segmentsPerMessage\":1,\"sampleRecipients\":[\"639998414123\"],\"status\":\"MOCK_SENT\"}', NULL),
(14, 2, 'ORANGE ALERT: Prepare for Immediate Evacuation', 'PRE-EVACUATION WARNING: Severe weather approaching Zone 1. Pack emergency go-bags, secure documents, and prepare for evacuation by 12:09 AM.', 'ORANGE', 'SMS', '2026-08-11 16:09:45', 'ALL', 'Zone 1', 1, 1, 'QUEUED', '{\"mode\":\"LIVE\",\"provider\":\"iprogsms\",\"endpoint\":\"https://www.iprogsms.com/api/v1/sms_messages\",\"dispatchedAt\":\"2026-08-11T16:09:45.952Z\",\"totalTargeted\":1,\"validPhonesCount\":1,\"queuedCount\":1,\"failureCount\":0,\"status\":\"QUEUED\",\"primaryMessageId\":\"iSms-mWRbQS\",\"messageIds\":[\"iSms-mWRbQS\"],\"lastError\":null,\"rawApiResponses\":[{\"phone\":\"639278935759\",\"success\":true,\"statusCode\":200,\"status\":\"QUEUED\",\"messageId\":\"iSms-mWRbQS\",\"error\":\"SMS successfully queued for delivery.\",\"response\":{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-mWRbQS\",\"message_status_link\":\"https://www.iprogsms.com/api/v1/sms_messages/status?api_token=12345&message_id=iSms-mWRbQS\",\"message_status_request_mode\":\"GET\",\"sms_rate\":1},\"timestamp\":\"2026-08-11T16:09:40.174Z\"}]}', 'iSms-mWRbQS'),
(15, 2, 'GREEN ALERT: All Clear & Safe Return', 'EvacWar Alerts\r\n\r\nALL CLEAR: Danger has passed in Zone 1. Evacuees are cleared for safe return home as of 9:25 PM. Thank you for your cooperation!\r\n\r\nEvacWar | San Rafael', 'GREEN', 'SMS', '2026-08-12 13:25:17', 'ALL', 'Zone 1', 1, 1, 'QUEUED', '{\"mode\":\"LIVE\",\"provider\":\"iprogsms\",\"endpoint\":\"https://www.iprogsms.com/api/v1/sms_messages\",\"dispatchedAt\":\"2026-08-12T13:25:17.722Z\",\"totalTargeted\":1,\"validPhonesCount\":1,\"queuedCount\":1,\"failureCount\":0,\"status\":\"QUEUED\",\"primaryMessageId\":\"iSms-sGz0xa\",\"messageIds\":[\"iSms-sGz0xa\"],\"lastError\":null,\"rawApiResponses\":[{\"phone\":\"639278935759\",\"success\":true,\"statusCode\":200,\"status\":\"QUEUED\",\"messageId\":\"iSms-sGz0xa\",\"error\":\"SMS successfully queued for delivery.\",\"response\":{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-sGz0xa\",\"message_status_link\":\"https://www.iprogsms.com/api/v1/sms_messages/status?api_token=12345&message_id=iSms-sGz0xa\",\"message_status_request_mode\":\"GET\",\"sms_rate\":1},\"timestamp\":\"2026-08-12T13:25:14.973Z\"}]}', 'iSms-sGz0xa'),
(16, 2, 'ORANGE ALERT: Prepare for Immediate Evacuation', 'Niggaaaaaa', 'ORANGE', 'SMS', '2026-08-21 01:40:43', 'ALL', 'Zone 2', 4, 4, 'PARTIAL_SUCCESS', '{\"mode\":\"LIVE\",\"provider\":\"iprogsms\",\"endpoint\":\"https://www.iprogsms.com/api/v1/sms_messages\",\"dispatchedAt\":\"2026-08-21T01:40:43.697Z\",\"totalTargeted\":4,\"validPhonesCount\":4,\"queuedCount\":3,\"failureCount\":1,\"status\":\"PARTIAL_SUCCESS\",\"primaryMessageId\":\"iSms-hliIl9,iSms-TgbPLB,iSms-J5UcvG\",\"messageIds\":[\"iSms-hliIl9\",\"iSms-TgbPLB\",\"iSms-J5UcvG\"],\"lastError\":[\"Smart/TNT networks do not accept shared sender names. Please get your own sender name approved at https://www.iprogsms.com/sender-names/new to support all networks.\"],\"rawApiResponses\":[{\"phone\":\"639658202727\",\"success\":true,\"statusCode\":200,\"status\":\"QUEUED\",\"messageId\":\"iSms-hliIl9\",\"error\":\"SMS successfully queued for delivery.\",\"response\":{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-hliIl9\",\"message_status_link\":\"https://www.iprogsms.com/api/v1/sms_messages/status?api_token=12345&message_id=iSms-hliIl9\",\"message_status_request_mode\":\"GET\",\"sms_rate\":1},\"timestamp\":\"2026-08-21T01:40:42.172Z\"},{\"phone\":\"639947787678\",\"success\":true,\"statusCode\":200,\"status\":\"QUEUED\",\"messageId\":\"iSms-TgbPLB\",\"error\":\"SMS successfully queued for delivery.\",\"response\":{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-TgbPLB\",\"message_status_link\":\"https://www.iprogsms.com/api/v1/sms_messages/status?api_token=12345&message_id=iSms-TgbPLB\",\"message_status_request_mode\":\"GET\",\"sms_rate\":1},\"timestamp\":\"2026-08-21T01:40:42.251Z\"},{\"phone\":\"639112223333\",\"success\":false,\"statusCode\":200,\"status\":\"FAILED\",\"messageId\":null,\"error\":[\"Smart/TNT networks do not accept shared sender names. Please get your own sender name approved at https://www.iprogsms.com/sender-names/new to support all networks.\"],\"response\":{\"status\":500,\"message\":[\"Smart/TNT networks do not accept shared sender names. Please get your own sender name approved at https://www.iprogsms.com/sender-names/new to support all networks.\"]},\"timestamp\":\"2026-08-21T01:40:42.252Z\"},{\"phone\":\"639949943127\",\"success\":true,\"statusCode\":200,\"status\":\"QUEUED\",\"messageId\":\"iSms-J5UcvG\",\"error\":\"SMS successfully queued for delivery.\",\"response\":{\"status\":200,\"message\":\"SMS successfully queued for delivery.\",\"message_id\":\"iSms-J5UcvG\",\"message_status_link\":\"https://www.iprogsms.com/api/v1/sms_messages/status?api_token=12345&message_id=iSms-J5UcvG\",\"message_status_request_mode\":\"GET\",\"sms_rate\":1},\"timestamp\":\"2026-08-21T01:40:42.253Z\"}]}', 'iSms-hliIl9,iSms-TgbPLB,iSms-J5UcvG');

-- --------------------------------------------------------

--
-- Table structure for table `check_ins`
--

CREATE TABLE `check_ins` (
  `id` int(11) NOT NULL,
  `resident_id` int(11) DEFAULT NULL,
  `household_member_id` int(11) DEFAULT NULL,
  `center_id` int(11) DEFAULT NULL,
  `check_in_time` timestamp NOT NULL DEFAULT current_timestamp(),
  `check_out_time` timestamp NULL DEFAULT NULL,
  `status` enum('ACTIVE','DEPARTED','CHECKED_IN','CHECKED_OUT') DEFAULT 'ACTIVE',
  `check_in_method` enum('QR','MANUAL') DEFAULT 'QR',
  `staff_user_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `check_ins`
--

INSERT INTO `check_ins` (`id`, `resident_id`, `household_member_id`, `center_id`, `check_in_time`, `check_out_time`, `status`, `check_in_method`, `staff_user_id`) VALUES
(1, 1, NULL, 2, '2026-08-14 13:05:37', '2026-08-14 13:05:37', 'CHECKED_OUT', 'QR', NULL),
(2, 34, NULL, 2, '2026-08-18 12:07:34', NULL, 'ACTIVE', 'QR', 14),
(3, 1, NULL, 2, '2026-08-18 12:11:28', NULL, 'ACTIVE', 'QR', 14),
(4, 1, 4, 2, '2026-08-18 12:11:28', NULL, 'ACTIVE', 'QR', 14),
(5, 42, NULL, 7, '2026-08-27 02:26:22', NULL, 'ACTIVE', 'MANUAL', 9),
(6, 43, NULL, 7, '2026-08-27 02:30:51', NULL, 'ACTIVE', 'MANUAL', 9);

-- --------------------------------------------------------

--
-- Table structure for table `evacuation_centers`
--

CREATE TABLE `evacuation_centers` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` text NOT NULL,
  `contact_number` varchar(50) DEFAULT '(054) 881-2345',
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `max_capacity` int(11) NOT NULL,
  `current_occupancy` int(11) DEFAULT 0,
  `status` enum('OPEN','FULL','CLOSED') DEFAULT 'OPEN'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `evacuation_centers`
--

INSERT INTO `evacuation_centers` (`id`, `name`, `address`, `contact_number`, `latitude`, `longitude`, `max_capacity`, `current_occupancy`, `status`) VALUES
(2, 'Ikpan Elementary School', 'Zone 5', '09947787678', 13.51037137, 123.34810268, 150, 3, 'OPEN'),
(6, 'Barcelona Site', 'Zone 6', '(054) 881-2345', 13.50977299, 123.34742199, 150, 0, 'OPEN'),
(7, 'Louie Sinfuego', 'Zone 7', '098367499103', 13.51199000, 123.35404300, 50, 2, 'OPEN'),
(8, 'Joel Bayos', 'Zone 2', '09400589414', 13.50833900, 123.33868600, 50, 0, 'OPEN');

-- --------------------------------------------------------

--
-- Table structure for table `household_members`
--

CREATE TABLE `household_members` (
  `id` int(11) NOT NULL,
  `resident_id` int(11) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `relation` varchar(50) DEFAULT NULL,
  `sex` enum('Male','Female') DEFAULT 'Male',
  `birthdate` date DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `is_pregnant` tinyint(1) DEFAULT 0,
  `is_lactating` tinyint(1) DEFAULT 0,
  `is_pwd` tinyint(1) DEFAULT 0,
  `has_serious_illness` tinyint(1) DEFAULT 0,
  `serious_illness_details` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `household_members`
--

INSERT INTO `household_members` (`id`, `resident_id`, `first_name`, `middle_name`, `last_name`, `relation`, `sex`, `birthdate`, `age`, `status`, `is_pregnant`, `is_lactating`, `is_pwd`, `has_serious_illness`, `serious_illness_details`) VALUES
(2, 9, 'Ian2', NULL, 'borromeo', 'Family', 'Male', NULL, 45, 'pwd', 0, 0, 0, 0, NULL),
(3, 35, 'Tonet', NULL, 'Devera', 'Family', 'Male', NULL, 48, 'pwd,elderly', 0, 0, 0, 0, NULL),
(4, 1, 'Boni', NULL, 'Anhag', 'Family', 'Female', '2005-01-31', 21, 'pwd', 0, 0, 1, 0, NULL),
(5, 37, 'Emilia', 'Babia', 'Templonuevo', 'Family', 'Female', '1966-05-28', 60, 'elderly', 0, 0, 0, 0, NULL),
(6, 37, 'Amiel', 'Babia', 'Templonuevo', 'Family', 'Male', '2002-04-24', 24, NULL, 0, 0, 0, 0, NULL),
(7, 40, 'Althea', 'Toniza', 'Tuyay', 'Family', 'Female', '2012-08-21', 14, NULL, 0, 0, 0, 0, NULL),
(8, 37, 'Jhonas', 'Unknown', 'Buena', 'Family', 'Male', '2004-08-18', 22, 'pwd', 0, 0, 1, 0, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `map_settings`
--

CREATE TABLE `map_settings` (
  `key_name` varchar(50) NOT NULL,
  `value` longtext DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `map_settings`
--

INSERT INTO `map_settings` (`key_name`, `value`, `updated_at`) VALUES
('drawn_features', '{\"type\":\"FeatureCollection\",\"features\":[]}', '2026-08-10 13:02:10');

-- --------------------------------------------------------

--
-- Table structure for table `residents`
--

CREATE TABLE `residents` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `sex` enum('Male','Female') DEFAULT 'Male',
  `birthdate` date DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `contact_number` varchar(20) NOT NULL,
  `home_address` text NOT NULL,
  `family_size` int(11) DEFAULT 1,
  `has_special_needs` tinyint(1) DEFAULT 0,
  `is_4ps` tinyint(1) DEFAULT 0,
  `is_pregnant` tinyint(1) DEFAULT 0,
  `is_lactating` tinyint(1) DEFAULT 0,
  `is_pwd` tinyint(1) DEFAULT 0,
  `is_single_head` tinyint(1) DEFAULT 0,
  `has_serious_illness` tinyint(1) DEFAULT 0,
  `serious_illness_details` varchar(255) DEFAULT NULL,
  `profile_photo` varchar(255) DEFAULT NULL,
  `qr_code_uuid` varchar(36) NOT NULL,
  `barangay` varchar(100) DEFAULT 'San Rafael',
  `emergency_contact_name` varchar(100) DEFAULT NULL,
  `emergency_contact_phone` varchar(20) DEFAULT NULL,
  `vulnerability` varchar(100) DEFAULT 'None'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `residents`
--

INSERT INTO `residents` (`id`, `user_id`, `first_name`, `middle_name`, `last_name`, `sex`, `birthdate`, `age`, `contact_number`, `home_address`, `family_size`, `has_special_needs`, `is_4ps`, `is_pregnant`, `is_lactating`, `is_pwd`, `is_single_head`, `has_serious_illness`, `serious_illness_details`, `profile_photo`, `qr_code_uuid`, `barangay`, `emergency_contact_name`, `emergency_contact_phone`, `vulnerability`) VALUES
(1, 1, 'Keeshia', NULL, 'Anhag', 'Male', '2007-01-07', 19, '09875431234', 'Zone 6', 2, 0, 0, 0, 0, 0, 0, 0, NULL, 'profile_1_1787240805001_72ba2f7f.jpg', '6d2000d9-49a2-4057-b6b8-3efdd2da244f', 'San Rafael', 'Tonet Anhag', '09181234567', 'None'),
(5, 6, 'Laurence', NULL, 'Sinfuego', 'Male', NULL, NULL, '1234567890', 'Zone 7', 1, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '116943e0-97dc-4929-b01f-70af4f58c836', 'San Rafael', NULL, NULL, 'None'),
(8, 9, 'ian', NULL, 'borromeo', 'Male', NULL, NULL, '012347849213', 'Zone 2', 1, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '0d4f36ec-761b-4b05-932d-b848e41e8ef7', 'San Rafael', NULL, NULL, 'None'),
(9, 10, 'Angelica', NULL, 'Borromeo', 'Male', NULL, NULL, '0987654321', 'Zone 4', 2, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '545d3e13-2030-4694-a70f-cd9fab04f06e', 'San Rafael', NULL, NULL, 'None'),
(11, 14, 'Barangay', NULL, 'Council Member', 'Male', NULL, NULL, '09123456789', 'Zone 5', 1, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '9eb6282f-9cfc-4304-9104-e5c553d08a49', 'Zone 5', 'MDRRMO Hotline', '911', 'None'),
(22, 3, 'Laurence', NULL, 'Sinfuego', 'Male', NULL, NULL, '09100246779', 'Zone 7', 1, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '11ea8926-8f46-42dd-86d4-984157219b30', 'Zone 7', '', '', 'None'),
(34, 36, 'Gabby', NULL, 'Sinfuego', 'Male', NULL, NULL, '09278935759', 'Zone 1', 1, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '4d7c1f18-e3f4-4118-a4b5-742e27a786af', 'San Rafael', '', '', 'None'),
(35, 37, 'Resident', 'Devera', 'Test', 'Male', NULL, NULL, '09999999999', 'Zone 1', 2, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, 'f691893f-52f2-4243-b427-2ceb5cb6ae7d', 'Zone 1', NULL, NULL, 'None'),
(37, 44, 'Ian', 'Babia', 'Templonuevo', 'Male', '2004-09-14', 21, '0994 994 3127', 'Zone 2', 4, 1, 1, 0, 0, 1, 0, 0, 'sinto sinto', 'profile_44_1787276337571_f1c94f90.jpg', 'c7c175d9-88f5-439c-b7ca-b87eda7426ba', 'San Rafael', 'Amiel B. Templonuevo', '09815427775', 'None'),
(38, 45, 'Johnuel', 'B', 'Latco', 'Female', '2005-03-23', 21, '09658202727', 'Zone 2', 1, 1, 0, 1, 0, 0, 0, 0, NULL, 'profile_45_1787276270621_b88d5fa2.jpeg', '689c5ed7-3e15-41a3-a688-ebf54bc4eabb', 'San Rafael', 'Vice Ganda', '0912345678', 'None'),
(39, 2, 'Super', NULL, 'Administrator', 'Male', NULL, NULL, '099457684231', 'Municipal Disaster Risk Reduction Management Office', 1, 0, 0, 0, 0, 0, 0, 0, NULL, 'profile_2_1787278369300_d97f5196.jpg', '5087073c-1d2d-4b21-8647-5908f1f4f2e4', 'San Rafael', 'Baao Hotline', '911', 'None'),
(40, 46, 'Angie', 'iToniza', 'Tuyay', 'Female', '2005-08-09', 21, '09347356437', 'Zone 5', 2, 0, 0, 0, 0, 0, 1, 0, NULL, NULL, '63786ab7-fbd8-47d8-9c71-6453b121fad1', 'San Rafael', 'Johnuel Borromeo', '09837373728', 'None'),
(42, NULL, 'Iverta', 'Sinfuego', 'Bisenio', 'Female', NULL, 65, '028484920101', 'Zone 7', 1, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, '992f2d8d-afb0-4175-bdec-f8bc0a9f7220', 'San Rafael', NULL, NULL, 'None'),
(43, NULL, 'Restituto', 'Brillo', 'Sinfuego', 'Male', NULL, 65, '09374829100', 'Zone 7', 1, 0, 1, 0, 0, 0, 0, 0, NULL, NULL, 'eed388a0-95c2-4049-9e7e-8b378a2e180e', 'San Rafael', NULL, NULL, 'None');

-- --------------------------------------------------------

--
-- Table structure for table `sos_alerts`
--

CREATE TABLE `sos_alerts` (
  `id` int(11) NOT NULL,
  `resident_id` int(11) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `accuracy` decimal(8,2) DEFAULT 0.00,
  `status` enum('ACTIVE','ACKNOWLEDGED','RESPONDING','RESCUED','RESOLVED','CANCELLED') DEFAULT 'ACTIVE',
  `handled_by` int(11) DEFAULT NULL,
  `responder_notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sos_alerts`
--

INSERT INTO `sos_alerts` (`id`, `resident_id`, `name`, `latitude`, `longitude`, `accuracy`, `status`, `handled_by`, `responder_notes`, `created_at`, `updated_at`) VALUES
(1, 9999, 'Test Resident GPS', 13.51100000, 123.34800000, 8.00, 'RESOLVED', NULL, NULL, '2026-08-12 11:15:46', '2026-08-12 11:15:46'),
(2, NULL, 'Gabby', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-12 11:35:01', '2026-08-13 14:23:56'),
(3, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-13 14:23:08', '2026-08-13 14:23:58'),
(4, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-16 14:56:58', '2026-08-16 15:14:21'),
(5, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-16 15:08:06', '2026-08-16 15:14:19'),
(6, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 12:31:31', '2026-08-18 12:43:06'),
(7, NULL, 'Keeshia', 13.51220007, 123.35399802, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 12:32:36', '2026-08-18 12:43:14'),
(8, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 12:37:09', '2026-08-18 12:43:04'),
(9, NULL, 'Keeshia', 13.51486262, 123.34808038, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 12:37:41', '2026-08-18 12:43:09'),
(10, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 12:43:24', '2026-08-18 12:43:30'),
(11, NULL, 'Keeshia', 13.51143749, 123.34720517, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 12:43:40', '2026-08-18 12:43:47'),
(12, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 12:48:48', '2026-08-18 12:48:55'),
(13, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', 9, NULL, '2026-08-18 12:56:48', '2026-08-18 13:51:26'),
(14, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 13:02:09', '2026-08-18 13:02:17'),
(15, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:06:22', '2026-08-18 13:51:26'),
(16, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:08:55', '2026-08-18 13:51:26'),
(17, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:11:46', '2026-08-18 13:51:26'),
(18, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:12:20', '2026-08-18 13:51:26'),
(19, NULL, 'Keeshia', 13.51066333, 123.34755211, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:12:42', '2026-08-18 13:51:26'),
(20, NULL, 'Keeshia', 13.51066333, 123.34755211, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:16:02', '2026-08-18 13:51:26'),
(21, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:16:24', '2026-08-18 13:51:26'),
(22, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:19:55', '2026-08-18 13:51:26'),
(23, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:22:57', '2026-08-18 13:51:26'),
(24, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:23:14', '2026-08-18 13:51:26'),
(25, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:27:58', '2026-08-18 13:51:26'),
(26, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:29:04', '2026-08-18 13:51:26'),
(27, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:30:49', '2026-08-18 13:51:26'),
(28, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:30:57', '2026-08-18 13:51:26'),
(29, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:31:14', '2026-08-18 13:51:26'),
(30, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:32:30', '2026-08-18 13:51:26'),
(31, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:32:39', '2026-08-18 13:51:26'),
(32, NULL, 'Keeshia', 13.51007112, 123.34731537, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:33:24', '2026-08-18 13:48:39'),
(33, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:35:03', '2026-08-18 13:51:26'),
(34, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:35:29', '2026-08-18 13:48:36'),
(35, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:40:23', '2026-08-18 13:48:34'),
(36, NULL, 'Keeshia', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 13:44:17', '2026-08-18 13:48:32'),
(37, 1, 'Keeshia Anhag', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 13:47:23', '2026-08-18 13:47:27'),
(38, 1, 'Keeshia Anhag', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 13:54:12', '2026-08-18 13:54:41'),
(39, 1, 'Keeshia Anhag', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-18 13:54:52', '2026-08-18 14:01:18'),
(40, 1, 'Keeshia Anhag', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 14:01:59', '2026-08-18 14:02:20'),
(41, 1, 'Keeshia Anhag', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-18 14:02:46', '2026-08-18 14:04:45'),
(42, 1, 'Keeshia Anhag', 13.47000000, 123.37000000, 50000.00, 'RESOLVED', 9, NULL, '2026-08-18 14:05:58', '2026-08-18 14:06:41'),
(43, 1, 'Keeshia Anhag', 13.47000000, 123.37000000, 50000.00, 'CANCELLED', NULL, NULL, '2026-08-18 14:08:01', '2026-08-18 14:08:50'),
(44, 34, 'Gabby Sinfuego', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-19 14:46:52', '2026-08-19 14:47:06'),
(45, 1, 'Keeshia Anhag', 13.47000000, 123.37000000, 50000.00, 'CANCELLED', NULL, NULL, '2026-08-20 14:00:47', '2026-08-20 14:00:57'),
(46, 1, 'Keeshia Anhag', 13.46863410, 123.37244396, 0.00, 'CANCELLED', NULL, NULL, '2026-08-20 14:00:58', '2026-08-20 14:01:19'),
(47, 1, 'Keeshia Anhag', 13.46863410, 123.37244396, 0.00, 'CANCELLED', NULL, NULL, '2026-08-20 14:01:42', '2026-08-20 14:02:49'),
(48, 1, 'Keeshia Anhag', 13.47000000, 123.37000000, 50000.00, 'CANCELLED', NULL, NULL, '2026-08-20 14:07:49', '2026-08-20 14:08:17'),
(49, 1, 'Keeshia Anhag', 13.47000000, 123.37000000, 50000.00, 'CANCELLED', NULL, NULL, '2026-08-20 14:08:18', '2026-08-20 14:08:44'),
(50, 1, 'Keeshia Anhag', 13.51059897, 123.34822050, 0.00, 'CANCELLED', NULL, NULL, '2026-08-20 14:10:27', '2026-08-20 14:13:52'),
(51, 37, 'Ian Templonuevo', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 01:43:16', '2026-08-21 01:45:56'),
(52, 38, 'Johnuel Borromeo', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 01:43:34', '2026-08-21 01:45:42'),
(53, 40, 'Angelica Tuyay', 13.51020000, 123.34700000, 0.00, 'RESOLVED', NULL, NULL, '2026-08-21 02:33:54', '2026-08-21 05:14:50'),
(54, 37, 'Ian Templonuevo', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 04:13:46', '2026-08-21 04:14:04'),
(55, 37, 'Ian Templonuevo', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 04:14:06', '2026-08-21 04:14:18'),
(56, 37, 'Ian Templonuevo', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 04:15:54', '2026-08-21 04:16:15'),
(57, 37, 'Ian Templonuevo', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 04:16:38', '2026-08-21 04:20:17'),
(58, 37, 'Ian Templonuevo', 13.51762904, 123.35084438, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 04:56:21', '2026-08-21 04:56:35'),
(59, 1, 'Keeshia Anhag', 13.51541985, 123.35077442, 0.00, 'RESOLVED', 9, NULL, '2026-08-21 05:21:59', '2026-08-21 05:33:25'),
(60, 38, 'Johnuel Latco', 13.51020000, 123.34700000, 0.00, 'CANCELLED', NULL, NULL, '2026-08-21 05:23:55', '2026-08-21 05:24:01');

-- --------------------------------------------------------

--
-- Table structure for table `sos_emergency`
--

CREATE TABLE `sos_emergency` (
  `id` int(11) NOT NULL,
  `resident_id` int(11) DEFAULT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `status` enum('PENDING','EN_ROUTE','RESOLVED') DEFAULT 'PENDING',
  `handled_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `resolved_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `staff`
--

CREATE TABLE `staff` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `occupation` varchar(100) DEFAULT 'Emergency Staff',
  `staff_type` enum('EVACUATION','RESCUER','BOTH') DEFAULT 'BOTH',
  `assigned_center_id` int(11) DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `profile_photo` varchar(255) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','ON_DUTY','OFF_DUTY') DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `staff`
--

INSERT INTO `staff` (`id`, `user_id`, `first_name`, `middle_name`, `last_name`, `occupation`, `staff_type`, `assigned_center_id`, `contact_number`, `profile_photo`, `status`, `created_at`) VALUES
(1, 9, 'ian', NULL, 'borromeo', 'Emergency Staff', 'RESCUER', 2, '012347849213', 'profile_9_1787278328380_efff556e.jpg', 'ACTIVE', '2026-08-20 14:54:25'),
(2, 13, 'docot', NULL, 'Member', 'Emergency Staff', 'BOTH', NULL, NULL, NULL, 'ACTIVE', '2026-08-20 14:54:25'),
(3, 14, 'Barangay', NULL, 'Council Member', 'Emergency Staff', 'EVACUATION', NULL, '09123456789', NULL, 'ACTIVE', '2026-08-20 14:54:25');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','staff','barangay_council','resident') NOT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password_hash`, `role`, `is_verified`, `created_at`) VALUES
(1, 'kesh@gmail.com', '$2b$10$4djhQDoodwBOYuyLTm.wu.u3rRxPtZvKIxDMVR6j9BcaMdyctvGl.', 'resident', 0, '2026-05-14 23:52:45'),
(2, 'monette@gmai.com', '$2b$10$.tcrXwkqndd5Lr1fqJDNyOUAt0cjGYUQePJBPyn2gVzDq8L5dOY7.', 'admin', 0, '2026-05-15 00:08:13'),
(3, 'laurencesinfuego@gmail.com', '$2b$10$oEyxAJScbBxNfwNvUp/CduB4xF7apg2xlwZFqfk833zKNtbFobtei', 'resident', 0, '2026-05-15 04:04:48'),
(6, 'lasinfuego@my.cspc.edu.ph', '$2b$10$/DLaWwVlp87rv6oU0Dftv.uVtL11imySYoFKYdYX2jvrgIE2A5YMy', 'resident', 0, '2026-05-15 15:17:33'),
(9, 'staff3@yahoo.com', '$2b$10$qh0AlFba5PotFRxtxPJ6TOJgVi9qPT1JTyKupTi7JoI0mPC.Bx2W2', 'staff', 1, '2026-05-15 15:25:43'),
(10, 'an@gmail.com', '$2b$10$m2DLfeBNhdjlXyGlMMKMTO0cjdPZezoksuaKtf87xaEUqbE9TdZua', 'resident', 0, '2026-05-15 15:28:01'),
(13, 'docot@yahoo.com', '$2b$10$ZXfwxtBjX9bTsBkowEKWRuNRILM9LUmlFrbFy9kCdO9QsJTPMGAca', 'staff', 1, '2026-05-15 15:31:51'),
(14, 'staff@evacwar.gov.ph', '$2b$10$arHeluMrtnchyu03Bx5r3u3eFDHwBbE2W6Eocs8kqB7MC8l6ek0Ly', 'staff', 1, '2026-08-08 13:05:42'),
(17, 'spiderman_test_1786281989539@example.com', '$2b$10$EAhjc/UNeeoRJh/Vsiiu8u5OkmrKwCmyk3FYhpH8t4u/tcCoyBHcS', 'resident', 1, '2026-08-09 13:26:29'),
(18, 'man@yahoo.com', '$2b$10$UEpAMQHXO82b0JTIG/3qBewkmXDIzNqelAuJsgGlETPhVbuIMk0Ae', 'resident', 1, '2026-08-09 13:28:28'),
(19, 'spider@yahoo.com', '$2b$10$wFy5b2r2SiRKLem0R8Y1JeEZ9/nuND5cOHOVFFAWVkh7Z4uerro9m', 'resident', 1, '2026-08-09 13:31:37'),
(20, 'ma2n@yahoo.com', '$2b$10$l6GkCzO4u8aAclCoZzKIXerSMWHN1ilDbkMhsx9AJD2LAH9ZR5Ph2', 'resident', 1, '2026-08-09 13:34:14'),
(25, 'testresident_1786363894583@example.com', '$2b$10$Bul3XmBCqe/RQrXH7o/p8e9CSXZu056cJ4OC3IMcwRXGOzmoojgdS', 'resident', 1, '2026-08-10 12:11:36'),
(27, 'testresident_1786365429168@example.com', '$2b$10$Lpoh0SmcfgmL228McxPJTO6NdYz8/snUHO8YDpY9QfDA8JCe.Iy/i', 'resident', 1, '2026-08-10 12:37:09'),
(28, 'testresident_1786365710726@example.com', '$2b$10$fuvWo.f5hHtaoO1o5rMkVu8Mw9vAZVOjuvJk8O2wYytn4W4993O6.', 'resident', 1, '2026-08-10 12:41:50'),
(29, 'testresident_1786365946315@example.com', '$2b$10$qszyMme1sq8x4HbHgwcGsu.P6t9NFN4u2woU/vRheDgxqYHIORFy2', 'resident', 1, '2026-08-10 12:45:46'),
(30, 'testresident_1786366024380@example.com', '$2b$10$AiF1QBhBVlWHuKAgmuccqOnVw6lJsRDoEOu/iABLEuGh.bCjn3VsC', 'resident', 1, '2026-08-10 12:47:04'),
(31, 'testresident_1786366292023@example.com', '$2b$10$UDRcHj9Z48rtoln5HVx2zuqrtXVfNsOJdkePA3I.hDS/4l38o0FJC', 'resident', 1, '2026-08-10 12:51:32'),
(32, 'testresident_1786366513152@example.com', '$2b$10$P1DuuJqpEQZm72RvQYICMO5HaKf7KN0dZqi8PzzGin1Am9Fo78xBW', 'resident', 1, '2026-08-10 12:55:13'),
(33, 'testresident_1786366757768@example.com', '$2b$10$zfnUZflE.AQoE8PjyCLG/.7tKyz/vWQCLESRnnleKsj99TePPBCta', 'resident', 1, '2026-08-10 12:59:17'),
(35, 'gab@yahoo.com', '$2b$10$1nteuminC6cUYsB9IInFSecbFO4pQaFogP0veFK7DhJe0ENx6qJCq', 'resident', 1, '2026-08-11 13:26:38'),
(36, 'gagab@gmail.com', '$2b$10$Yl8ysUb9xllyetoqh2H/i.EXIZlD5kXuIyG90mS41/1l26JMc3tDW', 'resident', 1, '2026-08-11 16:08:43'),
(37, 'newresident@example.com', '$2b$10$n4vw0pp6y0azUZs5saHyDOBGyL3I4Fjc6swcEzgcjHTxNDusJMU1.', 'resident', 1, '2026-08-13 12:13:13'),
(44, 'iatemplonuevo@my.cspc.edu.ph', '$2b$10$ldYvvNJlyXwjh50xKP3XfeJIcX/2UXFZDw4h60BolEGzGTKldcIda', 'resident', 1, '2026-08-21 01:34:45'),
(45, 'borromeojohnueljr@gmail.com', '$2b$10$l2wqLkgvICPaSRZyrmq2YuX4ukEBHRxcL0Q6wFZRwBwLvthS8LOcu', 'resident', 1, '2026-08-21 01:35:07'),
(46, 'angelicatuyay0313@gmail.com', '$2b$10$zLKYCyqih//DUVbH.xLBiuJf8qI5s1eswenJWVSX34IuaRshfDOg.', 'resident', 1, '2026-08-21 02:31:17');

-- --------------------------------------------------------

--
-- Table structure for table `user_logs`
--

CREATE TABLE `user_logs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `weather_logs`
--

CREATE TABLE `weather_logs` (
  `id` int(11) NOT NULL,
  `weather_status` varchar(100) DEFAULT NULL,
  `wind_speed` decimal(5,2) DEFAULT NULL,
  `rainfall` decimal(5,2) DEFAULT NULL,
  `temperature` decimal(5,2) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `wind_gusts` decimal(5,2) DEFAULT NULL,
  `pressure` decimal(6,2) DEFAULT NULL,
  `humidity` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `weather_logs`
--

INSERT INTO `weather_logs` (`id`, `weather_status`, `wind_speed`, `rainfall`, `temperature`, `latitude`, `longitude`, `recorded_at`, `created_at`, `wind_gusts`, `pressure`, `humidity`) VALUES
(1, 'Light Drizzle', 11.20, 0.10, 25.00, 13.51020000, 123.34700000, '2026-08-11 12:59:35', '2026-08-11 12:59:35', NULL, NULL, NULL),
(2, 'Light Drizzle', 11.50, 0.10, 25.10, 13.51020000, 123.34700000, '2026-08-11 13:09:04', '2026-08-11 13:09:04', 25.60, 998.10, 95),
(3, 'Moderate Drizzle', 10.90, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:10:37', '2026-08-11 16:10:37', 24.80, 998.60, 97),
(4, 'Moderate Drizzle', 10.90, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:10:39', '2026-08-11 16:10:39', 24.80, 998.60, 97),
(5, 'Moderate Drizzle', 10.90, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:10:41', '2026-08-11 16:10:41', 24.80, 998.60, 97),
(6, 'Moderate Drizzle', 10.90, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:12:19', '2026-08-11 16:12:19', 24.80, 998.60, 97),
(7, 'Moderate Drizzle', 10.90, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:13:22', '2026-08-11 16:13:22', 24.80, 998.60, 97),
(8, 'Moderate Drizzle', 10.90, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:13:23', '2026-08-11 16:13:23', 24.80, 998.60, 97),
(9, 'Moderate Drizzle', 11.10, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:15:54', '2026-08-11 16:15:54', 24.80, 998.50, 97),
(10, 'Moderate Drizzle', 11.10, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:21:36', '2026-08-11 16:21:36', 24.80, 998.50, 97),
(11, 'Moderate Drizzle', 11.10, 0.20, 24.50, 13.51020000, 123.34700000, '2026-08-11 16:21:37', '2026-08-11 16:21:37', 24.80, 998.50, 97),
(12, 'Moderate Drizzle', 13.70, 0.20, 26.60, 13.51020000, 123.34700000, '2026-08-12 10:27:03', '2026-08-12 10:27:03', 37.40, 997.20, 82),
(13, 'Moderate Drizzle', 13.70, 0.20, 26.60, 13.51020000, 123.34700000, '2026-08-12 10:28:12', '2026-08-12 10:28:12', 37.40, 997.20, 82),
(14, 'Light Drizzle', 8.90, 0.10, 25.60, 13.51020000, 123.34700000, '2026-08-12 11:28:20', '2026-08-12 11:28:20', 30.20, 997.50, 90),
(15, 'Light Drizzle', 8.80, 0.10, 25.60, 13.51020000, 123.34700000, '2026-08-12 11:35:53', '2026-08-12 11:35:53', 26.30, 997.70, 90),
(16, 'Light Drizzle', 8.80, 0.10, 25.60, 13.51020000, 123.34700000, '2026-08-12 11:35:54', '2026-08-12 11:35:54', 26.30, 997.70, 90),
(17, 'Light Drizzle', 8.80, 0.10, 25.60, 13.51020000, 123.34700000, '2026-08-12 11:35:56', '2026-08-12 11:35:56', 26.30, 997.70, 90),
(18, 'Light Drizzle', 8.80, 0.10, 25.60, 13.51020000, 123.34700000, '2026-08-12 11:43:19', '2026-08-12 11:43:19', 26.30, 997.70, 90),
(19, 'Light Drizzle', 8.80, 0.10, 25.60, 13.51020000, 123.34700000, '2026-08-12 11:43:20', '2026-08-12 11:43:20', 26.30, 997.70, 90),
(20, 'Dense Drizzle', 9.80, 0.30, 25.30, 13.51020000, 123.34700000, '2026-08-12 12:21:30', '2026-08-12 12:21:30', 21.20, 998.20, 90),
(21, 'Dense Drizzle', 9.80, 0.30, 25.30, 13.51020000, 123.34700000, '2026-08-12 12:21:30', '2026-08-12 12:21:30', 21.20, 998.20, 90),
(22, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:47:47', '2026-08-12 12:47:47', 24.10, 998.50, 86),
(23, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:48:41', '2026-08-12 12:48:41', 24.10, 998.50, 86),
(24, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:54:29', '2026-08-12 12:54:29', 24.10, 998.50, 86),
(25, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:56:10', '2026-08-12 12:56:10', 24.10, 998.50, 86),
(26, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:56:12', '2026-08-12 12:56:12', 24.10, 998.50, 86),
(27, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:56:12', '2026-08-12 12:56:12', 24.10, 998.50, 86),
(28, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:57:51', '2026-08-12 12:57:51', 24.10, 998.50, 86),
(29, 'Overcast', 9.40, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 12:59:09', '2026-08-12 12:59:09', 24.10, 998.50, 86),
(30, 'Overcast', 9.50, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 13:03:28', '2026-08-12 13:03:28', 23.00, 998.60, 87),
(31, 'Overcast', 9.50, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 13:03:49', '2026-08-12 13:03:49', 23.00, 998.60, 87),
(32, 'Overcast', 9.50, 0.00, 26.40, 13.51020000, 123.34700000, '2026-08-12 13:03:50', '2026-08-12 13:03:50', 23.00, 998.60, 87),
(33, 'Overcast', 9.90, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:16:07', '2026-08-12 13:16:07', 23.00, 998.70, 87),
(34, 'Overcast', 9.90, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:16:08', '2026-08-12 13:16:08', 23.00, 998.70, 87),
(35, 'Overcast', 9.90, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:16:08', '2026-08-12 13:16:08', 23.00, 998.70, 87),
(36, 'Overcast', 9.90, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:16:12', '2026-08-12 13:16:12', 23.00, 998.70, 87),
(37, 'Overcast', 9.90, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:16:12', '2026-08-12 13:16:12', 23.00, 998.70, 87),
(38, 'Overcast', 9.90, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:28:05', '2026-08-12 13:28:05', 23.00, 998.70, 87),
(39, 'Overcast', 10.60, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:31:15', '2026-08-12 13:31:15', 23.80, 998.80, 87),
(40, 'Overcast', 10.60, 0.00, 26.30, 13.51020000, 123.34700000, '2026-08-12 13:36:23', '2026-08-12 13:36:23', 23.80, 998.80, 87),
(41, 'Overcast', 8.50, 0.00, 25.20, 13.51020000, 123.34700000, '2026-08-13 14:25:31', '2026-08-13 14:25:31', 23.00, 1000.00, 94),
(42, 'Thunderstorm', 15.90, 0.50, 25.00, 13.51020000, 123.34700000, '2026-08-17 09:19:21', '2026-08-17 09:19:21', 37.10, 997.00, 97),
(43, 'Overcast', 8.80, 0.00, 25.90, 13.51020000, 123.34700000, '2026-08-19 12:45:53', '2026-08-19 12:45:53', 22.00, 1001.00, 90);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `alerts`
--
ALTER TABLE `alerts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_alert_sender` (`sender_id`);

--
-- Indexes for table `check_ins`
--
ALTER TABLE `check_ins`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_checkin_resident` (`resident_id`),
  ADD KEY `fk_checkin_center` (`center_id`),
  ADD KEY `fk_checkin_staff` (`staff_user_id`);

--
-- Indexes for table `evacuation_centers`
--
ALTER TABLE `evacuation_centers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `household_members`
--
ALTER TABLE `household_members`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_hm_resident` (`resident_id`);

--
-- Indexes for table `map_settings`
--
ALTER TABLE `map_settings`
  ADD PRIMARY KEY (`key_name`);

--
-- Indexes for table `residents`
--
ALTER TABLE `residents`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `qr_code_uuid` (`qr_code_uuid`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Indexes for table `sos_alerts`
--
ALTER TABLE `sos_alerts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sos_emergency`
--
ALTER TABLE `sos_emergency`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_sos_resident` (`resident_id`),
  ADD KEY `fk_sos_handler` (`handled_by`);

--
-- Indexes for table `staff`
--
ALTER TABLE `staff`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`),
  ADD KEY `fk_staff_center` (`assigned_center_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `user_logs`
--
ALTER TABLE `user_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_logs_user` (`user_id`);

--
-- Indexes for table `weather_logs`
--
ALTER TABLE `weather_logs`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `alerts`
--
ALTER TABLE `alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `check_ins`
--
ALTER TABLE `check_ins`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `evacuation_centers`
--
ALTER TABLE `evacuation_centers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `household_members`
--
ALTER TABLE `household_members`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `residents`
--
ALTER TABLE `residents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=44;

--
-- AUTO_INCREMENT for table `sos_alerts`
--
ALTER TABLE `sos_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=61;

--
-- AUTO_INCREMENT for table `sos_emergency`
--
ALTER TABLE `sos_emergency`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `staff`
--
ALTER TABLE `staff`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

--
-- AUTO_INCREMENT for table `user_logs`
--
ALTER TABLE `user_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `weather_logs`
--
ALTER TABLE `weather_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=44;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `alerts`
--
ALTER TABLE `alerts`
  ADD CONSTRAINT `fk_alert_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `check_ins`
--
ALTER TABLE `check_ins`
  ADD CONSTRAINT `fk_checkin_center` FOREIGN KEY (`center_id`) REFERENCES `evacuation_centers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_checkin_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_checkin_staff` FOREIGN KEY (`staff_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `household_members`
--
ALTER TABLE `household_members`
  ADD CONSTRAINT `fk_hm_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `residents`
--
ALTER TABLE `residents`
  ADD CONSTRAINT `fk_resident_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `sos_emergency`
--
ALTER TABLE `sos_emergency`
  ADD CONSTRAINT `fk_sos_handler` FOREIGN KEY (`handled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_sos_resident` FOREIGN KEY (`resident_id`) REFERENCES `residents` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `staff`
--
ALTER TABLE `staff`
  ADD CONSTRAINT `fk_staff_center` FOREIGN KEY (`assigned_center_id`) REFERENCES `evacuation_centers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_staff_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_logs`
--
ALTER TABLE `user_logs`
  ADD CONSTRAINT `fk_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
