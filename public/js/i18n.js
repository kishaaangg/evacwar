/**
 * Evacwar - Centralized Multilingual Translation Engine
 * Supported Languages:
 *   - 'en': English (Default)
 *   - 'tl': Filipino / Tagalog
 *   - 'bcl': Bikol (Baao / Rinconada)
 */

(function () {
  const I18N_DICT = {
    en: {
      // Navigation
      nav_dashboard: "Dashboard",
      nav_map: "Map",
      nav_sos: "SOS",
      nav_emergency_sos: "Emergency SOS",
      nav_typhoon: "Typhoon",
      nav_typhoon_monitoring: "Typhoon Monitoring",
      nav_profile: "Profile",
      nav_staff_profile: "Staff Profile",
      nav_qr: "QR Scanner",
      nav_household_qr: "Household QR",
      nav_reports: "Reports",
      nav_residents: "Residents",
      nav_staff: "Staff",
      nav_alerts: "Alerts",
      nav_settings: "Settings",
      nav_logout: "Logout",
      nav_more: "More",
      nav_evac: "Evac",
      nav_weather: "Weather",

      // Common Buttons & Actions
      btn_edit_profile: "Edit Profile",
      btn_manage_profile: "Manage Profile",
      btn_save_changes: "Save Changes",
      btn_save_profile: "Save Profile",
      btn_cancel: "Cancel",
      btn_update_password: "Update Password",
      btn_logout: "Logout",
      btn_toggle: "Toggle",
      btn_scan: "Scan QR",
      btn_walkin_intake: "Walk-in Intake",
      btn_add_member: "Add Member",
      btn_search: "Search",
      btn_clear: "Clear",
      btn_select_all: "Select All Present",
      btn_check_in: "Check In Selected",
      btn_check_out: "Check Out",
      btn_back: "Back",
      btn_save: "Save",
      btn_submit: "Submit",
      btn_close: "Close",

      // Section Titles
      sec_account: "Account",
      sec_staff_account: "Staff Account",
      sec_staff_info: "Staff Identity & Details",
      sec_assignment: "Assignment & Operations",
      sec_duty_status: "Duty & Operational Scope",
      sec_emergency: "Emergency & Preferences",
      sec_app_settings: "App Settings",
      sec_security: "Security",
      sec_about: "About",

      // Resident Profile Labels
      page_title: "Profile",
      page_title_staff: "Staff Profile",
      badge_resident: "Resident",
      badge_staff: "Emergency Staff",
      badge_barangay_council: "Barangay Council",
      verified_account: "Verified Resident Account",
      verified_staff_account: "Verified Staff Account",
      
      row_manage_profile: "Manage Profile",
      sub_manage_profile: "Update full name, address, and mobile number",
      row_manage_staff_profile: "Manage Staff Profile",
      sub_manage_staff_profile: "Update name, occupation, contact number, and email",
      
      row_personal_info: "Personal Information",
      sub_personal_info: "Sex, birthdate, household size, and zone details",
      row_staff_identity: "Staff Identity Information",
      sub_staff_identity: "View staff role, user ID, and system credentials",
      
      row_family_members: "Family Members",
      sub_family_members: "Add dependents for emergency intake and food relief",
      row_household_qr: "Household QR Pass",
      sub_household_qr: "Scan for instant evacuation shelter check-in",

      row_assigned_center: "Assigned Evacuation Center",
      sub_assigned_center: "Official evacuation facility assignment",
      row_staff_scope: "Operational Scope & Role",
      sub_staff_scope: "Assigned emergency functions and responsibilities",

      row_notifications: "Notifications & Alerts",
      sub_notifications: "Typhoon advisories, SMS alerts & broadcast feed",
      row_emergency_contact: "Emergency Contact",
      row_vulnerability: "Vulnerability / Special Needs",
      row_evac_info: "Evacuation Information",
      sub_evac_info: "Nearest shelter, live occupancy & evacuation routes",

      row_language: "Language Settings",
      row_theme: "Theme (Light / Dark)",
      row_install_app: "Install Application",
      sub_install_app: "Install Evacwar on your phone or desktop for quick offline & emergency access",
      btn_install_app: "Install App",
      status_installed: "Installed",
      status_ready: "Ready",
      modal_install_title: "Install Evacwar App",
      modal_install_subtitle: "Fast Home Screen & Emergency Access",
      row_change_password: "Change Password",
      sub_change_password: "Update your account login password securely",
      row_logout: "Logout",
      sub_logout: "Sign out of your account",

      row_about: "About Evacwar",
      sub_about: "Barangay disaster preparedness & SOS assistance system",
      row_privacy: "Privacy & Terms",
      sub_privacy: "Data privacy protection & resident rights",
      row_protocols: "Staff Protocols & Privacy",
      sub_protocols: "Emergency responder conduct and data protection",

      // Form Field Labels
      lbl_first_name: "First Name",
      lbl_middle_name: "Middle Name",
      lbl_last_name: "Last Name",
      lbl_occupation: "Occupation / Position",
      lbl_contact_number: "Mobile Contact Number",
      lbl_email: "Email Address",
      lbl_assigned_barangay: "Assigned Barangay",
      lbl_assigned_center: "Assigned Evacuation Center",
      lbl_staff_type: "Staff Type",
      lbl_staff_status: "Staff Status",
      lbl_current_password: "Current Password",
      lbl_new_password: "New Password",
      lbl_confirm_password: "Confirm New Password",

      // General Badges / Statuses
      status_active: "Active",
      status_on_duty: "On Duty",
      status_off_duty: "Off Duty",
      status_inactive: "Inactive",
      status_checked_in: "CHECKED_IN",
      status_not_evacuated: "NOT EVACUATED",
      status_checked_out: "CHECKED OUT",
      controlled_by_admin: "Controlled by Admin",
      admin_assigned: "Admin Assigned",
      all_operations: "Evacuation & Rescue Operations",

      // Dashboards & Live Monitoring
      dash_welcome: "Welcome back,",
      dash_resident_subtitle: "Stay safe, alert, and prepared. Your household evacuation pass and emergency services are up to date and ready.",
      dash_staff_subtitle: "Evacuation Center Management & Emergency Response Operational Dashboard.",
      dash_rescuer_subtitle: "Active Emergency Response & SOS Rescue Dispatch System.",
      dash_admin_subtitle: "Disaster Risk Reduction & Emergency Operations Control Center.",
      dash_resident_portal: "Resident Portal",
      dash_staff_portal: "Staff Portal",
      dash_rescuer_portal: "Rescuer Portal",
      dash_admin_portal: "Admin Portal",
      dash_no_active_alerts: "No Active Emergency Warnings",
      dash_no_active_alerts_msg: "There are currently no active disaster or evacuation alerts broadcasted for Barangay San Rafael.",
      dash_official_alert: "Official Emergency Alert",
      dash_system_advisory: "System Advisory Status",
      dash_weather_title: "Live Weather & Typhoon Advisory",
      dash_weather_subtitle: "Barangay San Rafael, Baao, Camarines Sur",
      dash_evacuation_status: "Evacuation Center Status",
      dash_shelters_active: "Active Evacuation Shelters",
      dash_shelters_near_you: "Evacuation Shelters Near You",
      dash_view_all_shelters: "View All Shelters",
      dash_sos_distress: "SOS Distress Assistance",
      dash_request_rescue: "Request Immediate Rescue",
      dash_household_pass: "Household Pass",
      dash_view_qr_code: "View Pass & Members",
      dash_recent_alerts: "Recent Broadcast Advisories",
      dash_quick_actions: "Quick Operational Actions",
      dash_occupancy: "Total Occupancy",
      dash_capacity: "Capacity",
      dash_available: "Available",
      dash_full: "Full Capacity",
      dash_near_full: "Near Capacity",
      dash_checked_in: "Checked In",
      dash_active_sos: "Active SOS Requests",
      dash_rescued: "Rescued",
      dash_responding: "Responding",
      dash_acknowledged: "Acknowledged"
    },

    tl: {
      // Navigation
      nav_dashboard: "Dashboard",
      nav_map: "Mapa",
      nav_sos: "SOS",
      nav_emergency_sos: "Emergency SOS",
      nav_typhoon: "Bagyo",
      nav_typhoon_monitoring: "Pagsubaybay sa Bagyo",
      nav_profile: "Profile",
      nav_staff_profile: "Profile ng Kawani",
      nav_qr: "QR Scanner",
      nav_household_qr: "QR ng Pamilya",
      nav_reports: "Mga Ulat",
      nav_residents: "Mga Residente",
      nav_staff: "Mga Kawani",
      nav_alerts: "Mga Alerto",
      nav_settings: "Mga Setting",
      nav_logout: "Mag-logout",
      nav_more: "Higit Pa",
      nav_evac: "Evac",
      nav_weather: "Panahon",

      // Common Buttons & Actions
      btn_edit_profile: "I-edit ang Profile",
      btn_manage_profile: "Pamahalaan ang Profile",
      btn_save_changes: "I-save ang Pagbabago",
      btn_save_profile: "I-save ang Profile",
      btn_cancel: "Kanselahin",
      btn_update_password: "Palitan ang Password",
      btn_logout: "Mag-logout",
      btn_toggle: "Palitan",
      btn_scan: "I-scan ang QR",
      btn_walkin_intake: "Walk-in Intake",
      btn_add_member: "Magdagdag ng Miyembro",
      btn_search: "Maghanap",
      btn_clear: "I-clear",
      btn_select_all: "Piliin ang Naririto",
      btn_check_in: "I-check in ang Napili",
      btn_check_out: "I-check out",
      btn_back: "Bumalik",
      btn_save: "I-save",
      btn_submit: "Isumite",
      btn_close: "Isara",

      // Section Titles
      sec_account: "Account",
      sec_staff_account: "Account ng Kawani",
      sec_staff_info: "Impormasyon ng Kawani",
      sec_assignment: "Pagtatalaga at Operasyon",
      sec_duty_status: "Katayuan sa Tungkulin",
      sec_emergency: "Kagipitan at Kagustuhan",
      sec_app_settings: "Mga Setting ng App",
      sec_security: "Seguridad",
      sec_about: "Tungkol sa Sistema",

      // Resident & Staff Profile Labels
      page_title: "Profile ng Residente",
      page_title_staff: "Profile ng Kawani",
      badge_resident: "Residente",
      badge_staff: "Emergency Staff",
      badge_barangay_council: "Konseho ng Barangay",
      verified_account: "Beripikadong Resident Account",
      verified_staff_account: "Beripikadong Account ng Kawani",

      row_manage_profile: "Pamahalaan ang Profile",
      sub_manage_profile: "Baguhin ang pangalan, tirahan, at cellphone number",
      row_manage_staff_profile: "Pamahalaan ang Profile ng Kawani",
      sub_manage_staff_profile: "Baguhin ang pangalan, trabaho, cellphone number, at email",

      row_personal_info: "Personal na Impormasyon",
      sub_personal_info: "Kasarian, kaarawan, bilang ng pamilya, at purok",
      row_staff_identity: "Pagkakakilanlan ng Kawani",
      sub_staff_identity: "Tingnan ang tungkulin, user ID, at mga detalye",

      row_family_members: "Mga Kasama sa Bahay",
      sub_family_members: "Magdagdag ng miyembro para sa evacuation relief",
      row_household_qr: "QR Pass ng Pamilya",
      sub_household_qr: "I-scan para sa mabilis na pag-check-in sa shelter",

      row_assigned_center: "Itinalagang Evacuation Center",
      sub_assigned_center: "Opisyal na itinalagang evacuation facility",
      row_staff_scope: "Saklaw ng Tungkulin",
      sub_staff_scope: "Mga itinalagang responsibilidad sa panahon ng sakuna",

      row_notifications: "Mga Abiso at Alerto",
      sub_notifications: "Patalastas sa bagyo, SMS alerts & live feed",
      row_emergency_contact: "Maaaring Tawagan sa Emergency",
      row_vulnerability: "Espesyal na Pangangailangan / PWD",
      row_evac_info: "Impormasyon sa Evacuation",
      sub_evac_info: "Pinakamalapit na center at ligtas na daanan",

      row_language: "Wika / Language",
      row_theme: "Tema (Liwanag / Dilim)",
      row_install_app: "I-install ang Application",
      sub_install_app: "I-install ang Evacwar sa cellphone o computer para sa mabilisang emergency access",
      btn_install_app: "I-install ang App",
      status_installed: "Naka-install",
      status_ready: "Handa",
      modal_install_title: "I-install ang Evacwar App",
      modal_install_subtitle: "Mabilisang Pag-access sa Home Screen at Emergency",
      row_change_password: "Palitan ang Password",
      sub_change_password: "Palitan ang password para sa kaligtasan ng account",
      row_logout: "Mag-logout",
      sub_logout: "Umalis sa iyong account",

      row_about: "Tungkol sa Evacwar",
      sub_about: "Sistema ng kahandaan sa sakuna at SOS ng Barangay",
      row_privacy: "Patakaran sa Privacy",
      sub_privacy: "Proteksyon ng datos at karapatan ng residente",
      row_protocols: "Mga Patakaran ng Kawani",
      sub_protocols: "Alituntunin ng tagatugon at proteksyon ng datos",

      // Form Field Labels
      lbl_first_name: "Pangalan",
      lbl_middle_name: "Gitnang Pangalan",
      lbl_last_name: "Apelyido",
      lbl_occupation: "Trabaho / Posisyon",
      lbl_contact_number: "Numero ng Telepono",
      lbl_email: "Email Address",
      lbl_assigned_barangay: "Itinalagang Barangay",
      lbl_assigned_center: "Itinalagang Evacuation Center",
      lbl_staff_type: "Uri ng Kawani",
      lbl_staff_status: "Katayuan ng Kawani",
      lbl_current_password: "Kasalukuyang Password",
      lbl_new_password: "Bagong Password",
      lbl_confirm_password: "Ulitin ang Bagong Password",

      // General Badges / Statuses
      status_active: "Aktibo",
      status_on_duty: "Naka-Duty",
      status_off_duty: "Off-Duty",
      status_inactive: "Hindi Aktibo",
      status_checked_in: "CHECKED_IN",
      status_not_evacuated: "HINDI PA EVACUATED",
      status_checked_out: "NAKA-CHECK OUT",
      controlled_by_admin: "Pinamamahalaan ng Admin",
      admin_assigned: "Itinalaga ng Admin",
      all_operations: "Operasyon sa Evacuation at Rescue",

      // Dashboards & Live Monitoring
      dash_welcome: "Maligayang pagbabalik,",
      dash_resident_subtitle: "Manatiling ligtas at handa. Ang iyong household evacuation pass at mga serbisyo sa emergency ay updated at handa.",
      dash_staff_subtitle: "Pamamahala ng Evacuation Center at Operasyon sa Pagtugon sa Emergency.",
      dash_rescuer_subtitle: "Mabilis na Pagtugon sa Emergency at Sistema ng Rescue Dispatch.",
      dash_admin_subtitle: "Sentro ng Pamamahala at Operasyon sa Panahon ng Sakuna.",
      dash_resident_portal: "Portal ng Residente",
      dash_staff_portal: "Portal ng Kawani",
      dash_rescuer_portal: "Portal ng Tagatugon",
      dash_admin_portal: "Portal ng Admin",
      dash_no_active_alerts: "Walang Aktibong Babala sa Emergency",
      dash_no_active_alerts_msg: "Kasalukuyang walang aktibong babala ng sakuna o evacuation para sa Barangay San Rafael.",
      dash_official_alert: "Opisyal na Alerto sa Emergency",
      dash_system_advisory: "Katayuan ng Patalastas sa Sistema",
      dash_weather_title: "Ulat sa Panahon at Bagyo",
      dash_weather_subtitle: "Barangay San Rafael, Baao, Camarines Sur",
      dash_evacuation_status: "Katayuan ng Evacuation Center",
      dash_shelters_active: "Aktibong Evacuation Shelters",
      dash_shelters_near_you: "Mga Evacuation Center Malapit sa Iyo",
      dash_view_all_shelters: "Tingnan ang Lahat ng Center",
      dash_sos_distress: "Tulong sa SOS Emergency",
      dash_request_rescue: "Humingi ng Mabilis na Saklolo",
      dash_household_pass: "QR Pass ng Pamilya",
      dash_view_qr_code: "Tingnan ang Pass at Miyembro",
      dash_recent_alerts: "Mga Huling Patalastas",
      dash_quick_actions: "Mabilis na Aksyon",
      dash_occupancy: "Kabuuan ng Naka-evacuate",
      dash_capacity: "Kapasidad",
      dash_available: "May Bakante",
      dash_full: "Puno na",
      dash_near_full: "Halos Puno",
      dash_checked_in: "Naka-Check In",
      dash_active_sos: "Aktibong Hiling sa SOS",
      dash_rescued: "Naligtas Na",
      dash_responding: "Tumatugon Na",
      dash_acknowledged: "Natanggap Na"
    },

    bcl: {
      // Navigation
      nav_dashboard: "Dashboard",
      nav_map: "Mapa",
      nav_sos: "SOS",
      nav_emergency_sos: "Emergency SOS",
      nav_typhoon: "Bagyo",
      nav_typhoon_monitoring: "Pagsubaybay sa Bagyo",
      nav_profile: "Profile",
      nav_staff_profile: "Profile kan Kawani",
      nav_qr: "QR Scanner",
      nav_household_qr: "QR Pass kan Harong",
      nav_reports: "Mga Report",
      nav_residents: "Mga Residente",
      nav_staff: "Mga Kawani",
      nav_alerts: "Mga Alerto",
      nav_settings: "Mga Setting",
      nav_logout: "Mag-logout",
      nav_more: "Dugang Pa",

      // Common Buttons & Actions
      btn_edit_profile: "Hirahong Profile",
      btn_manage_profile: "Maneharon an Profile",
      btn_save_changes: "I-save an Ribay",
      btn_save_profile: "I-save an Profile",
      btn_cancel: "Kanselahon",
      btn_update_password: "Ribayan an Password",
      btn_logout: "Mag-logout",
      btn_toggle: "Ribayan",
      btn_scan: "I-scan an QR",
      btn_walkin_intake: "Walk-in Intake",
      btn_add_member: "Magdugang nin Miyembro",
      btn_search: "Hanapon",
      btn_clear: "I-clear",
      btn_select_all: "Pilion an Yaon Digdi",
      btn_check_in: "I-check in an Napili",
      btn_check_out: "I-check out",
      btn_back: "Magbalik",
      btn_save: "I-save",
      btn_submit: "Isumite",
      btn_close: "Isara",

      // Section Titles
      sec_account: "Account",
      sec_staff_account: "Account kan Kawani",
      sec_staff_info: "Impormasyon kan Kawani",
      sec_assignment: "Pagtalaan asin Operasyon",
      sec_duty_status: "Katindugan sa Tungkulin",
      sec_emergency: "Kagipitan asin Preferensya",
      sec_app_settings: "Mga Setting kan App",
      sec_security: "Seguridad",
      sec_about: "Manungod sa Sistema",

      // Resident & Staff Profile Labels
      page_title: "Profile kan Residente",
      page_title_staff: "Profile kan Kawani",
      badge_resident: "Residente",
      badge_staff: "Emergency Staff",
      badge_barangay_council: "Konseho kan Barangay",
      verified_account: "Beripikadong Account kan Residente",
      verified_staff_account: "Beripikadong Account kan Kawani",

      row_manage_profile: "Maneharon an Profile",
      sub_manage_profile: "Hirahong ngaran, erokan, asin numero kan cellphone",
      row_manage_staff_profile: "Maneharon an Profile kan Kawani",
      sub_manage_staff_profile: "Hirahong ngaran, trabaho, cellphone, asin email",

      row_personal_info: "Personal na Impormasyon",
      sub_personal_info: "Kasarian, kamundagan, bilang kan pamilya, asin purok",
      row_staff_identity: "Pagkamidbid kan Kawani",
      sub_staff_identity: "Hilingon an katungdan, user ID, asin kredensyal",

      row_family_members: "Mga Kaibanan sa Harong",
      sub_family_members: "Magdugang nin kapamilya para sa relief asin evacuation",
      row_household_qr: "Household QR Pass",
      sub_household_qr: "I-scan para sa marikas na check-in sa evacuation center",

      row_assigned_center: "Itinalagang Evacuation Center",
      sub_assigned_center: "Opisyal na itinalagang evacuation facility",
      row_staff_scope: "Saklaw kan Tungkulin",
      sub_staff_scope: "Mga itinalagang responsibilidad sa panahon kan kalamidad",

      row_notifications: "Mga Abiso asin Alerto",
      sub_notifications: "Patanid sa bagyo, SMS advisories asin live updates",
      row_emergency_contact: "Tawagan sa Emergency",
      row_vulnerability: "Kategorya nin Pangangaipo / PWD",
      row_evac_info: "Impormasyon sa Evacuation",
      sub_evac_info: "Pinakaharaning center asin ligtas na agihan",

      row_language: "Lenggwahe / Wika",
      row_theme: "Tema (Maliwanag / Madiklom)",
      row_install_app: "I-install an Application",
      sub_install_app: "I-install an Evacwar sa cellphone o computer para sa marikas na emergency access",
      btn_install_app: "I-install an App",
      status_installed: "Naka-install",
      status_ready: "Andam",
      modal_install_title: "I-install an Evacwar App",
      modal_install_subtitle: "Marikas na Pag-access sa Home Screen asin Emergency",
      row_change_password: "Ribayan an Password",
      sub_change_password: "I-update an password para sa proteksyon",
      row_logout: "Mag-logout",
      sub_logout: "Magluwas sa saimong account",

      row_about: "Manungod sa Evacwar",
      sub_about: "Disaster preparedness asin SOS kan Barangay San Rafael",
      row_privacy: "Privacy asin Kasuguan",
      sub_privacy: "Proteksyon kan datos kan lambang residente",
      row_protocols: "Kasuguan kan mga Kawani",
      sub_protocols: "Alituntunin kan tagasimbag asin proteksyon kan datos",

      // Form Field Labels
      lbl_first_name: "Pangaran",
      lbl_middle_name: "Tahaw na Pangaran",
      lbl_last_name: "Apelyido",
      lbl_occupation: "Trabaho / Posisyon",
      lbl_contact_number: "Numero kan Cellphone",
      lbl_email: "Email Address",
      lbl_assigned_barangay: "Itinalagang Barangay",
      lbl_assigned_center: "Itinalagang Evacuation Center",
      lbl_staff_type: "Klase nin Kawani",
      lbl_staff_status: "Estado kan Kawani",
      lbl_current_password: "Kasalukuyang Password",
      lbl_new_password: "Bagong Password",
      lbl_confirm_password: "Uliton an Bagong Password",

      // General Badges / Statuses
      status_active: "Aktibo",
      status_on_duty: "Naka-Duty",
      status_off_duty: "Off-Duty",
      status_inactive: "Dai Aktibo",
      status_checked_in: "CHECKED_IN",
      status_not_evacuated: "DAI PA NAEVACUATE",
      status_checked_out: "NAKACHECK-OUT",
      controlled_by_admin: "Pigmamanihar kan Admin",
      admin_assigned: "Itinalaga kan Admin",
      all_operations: "Operasyon sa Evacuation asin Rescue"
    }
  };

  // Helper cookie functions
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};path=/;expires=${d.toUTCString()};SameSite=Lax`;
  }

  function getCurrentLanguage() {
    return localStorage.getItem('Evacwar_lang') || getCookie('Evacwar_lang') || 'en';
  }

  function setAppLanguage(lang, label) {
    const supported = ['en', 'tl', 'bcl'];
    const selectedLang = supported.includes(lang) ? lang : 'en';
    
    localStorage.setItem('Evacwar_lang', selectedLang);
    setCookie('Evacwar_lang', selectedLang, 365);
    
    applyLanguage(selectedLang, label);
    
    // Dispatch custom event for any view-specific hooks
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: selectedLang, label: label } }));
  }

  function applyLanguage(lang, optionalLabel) {
    const targetLang = lang || getCurrentLanguage();
    const dict = I18N_DICT[targetLang] || I18N_DICT['en'];

    // Update active language label in UI
    const curLabel = document.getElementById('current-language-label');
    if (curLabel) {
      if (optionalLabel) {
        curLabel.innerText = optionalLabel;
      } else {
        curLabel.innerText = targetLang === 'tl' 
          ? 'Filipino / Tagalog' 
          : (targetLang === 'bcl' ? 'Bikol (Baao / Rinconada)' : 'English (Default)');
      }
    }

    // Update language modal button styles
    ['en', 'tl', 'bcl'].forEach(l => {
      const btn = document.getElementById(`lang-btn-${l}`);
      if (btn) {
        const check = btn.querySelector('.lang-check');
        if (l === targetLang) {
          btn.className = "w-full p-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-900 font-bold flex items-center justify-between transition-colors";
          if (check) check.classList.remove('hidden');
        } else {
          btn.className = "w-full p-3 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold flex items-center justify-between transition-colors profile-text-dark";
          if (check) check.classList.add('hidden');
        }
      }
    });

    // Translate all [data-i18n] text nodes
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.innerText = dict[key];
      }
    });

    // Translate all [data-i18n-placeholder] attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    // Translate all [data-i18n-title] attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (dict[key]) {
        el.setAttribute('title', dict[key]);
      }
    });
  }

  function t(key, fallback = '') {
    const lang = getCurrentLanguage();
    const dict = I18N_DICT[lang] || I18N_DICT['en'];
    return dict[key] || fallback || key;
  }

  // Expose to window
  window.EvacwarI18n = {
    setLanguage: setAppLanguage,
    applyLanguage: applyLanguage,
    getCurrentLanguage: getCurrentLanguage,
    t: t,
    dictionary: I18N_DICT
  };
  window.setAppLanguage = setAppLanguage;
  window.applyCurrentLanguage = applyLanguage;

  // Auto initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyLanguage(getCurrentLanguage());
    });
  } else {
    applyLanguage(getCurrentLanguage());
  }
})();
