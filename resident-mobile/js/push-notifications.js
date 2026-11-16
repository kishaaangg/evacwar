/**
 * Native Emergency Notifications are handled directly by MainActivity.java & LoRa/Socket.IO bridges.
 */
(function () {
  'use strict';
  const noop = async () => ({ success: true });
  window.EvacwarPush = {
    isAuthenticated: () => true,
    isSupported: () => false,
    getPermissionStatus: () => 'granted',
    register: noop,
    unsubscribe: noop,
    updateUI: () => {},
    autoSyncIfGranted: noop,
    onLoginSuccess: noop
  };
  window.EvakwarPush = window.EvacwarPush;
})();
