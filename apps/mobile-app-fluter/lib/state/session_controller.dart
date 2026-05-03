import "package:flutter/foundation.dart";

import "../models/user_profile.dart";
import "../services/app_services.dart";

class SessionController extends ChangeNotifier {
  SessionController({required AppServices appServices})
      : _appServices = appServices;

  final AppServices _appServices;

  UserProfile? _user;
  bool _isLoading = false;
  String? _errorMessage;
  bool _isInitialized = false;

  UserProfile? get user => _user;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isInitialized => _isInitialized;
  bool get isAuthenticated => _user != null;

  Future<void> initialize() async {
    if (_isInitialized) {
      return;
    }
    _setLoading(true);

    try {
      _user = await _appServices.authService.getMe();
      _errorMessage = null;
      _connectSocket();
    } catch (_) {
      _user = null;
      _errorMessage = null;
    } finally {
      _isInitialized = true;
      _setLoading(false);
    }
  }

  Future<bool> verifyLoginOtp({
    required String login,
    required String otpCode,
  }) async {
    _setLoading(true);
    try {
      final session = await _appServices.authService.verifyLoginOtp(
        login: login,
        otpCode: otpCode,
      );
      _user = session.user;
      _errorMessage = null;
      _connectSocket();
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> verifyRegisterOtp({
    required String login,
    required String otpCode,
  }) async {
    _setLoading(true);
    try {
      final session = await _appServices.authService.verifyRegisterOtp(
        login: login,
        otpCode: otpCode,
      );
      _user = session.user;
      _errorMessage = null;
      _connectSocket();
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> requestLoginOtp({
    required String login,
    required String password,
  }) async {
    _setLoading(true);
    try {
      await _appServices.authService.requestLoginOtp(
        login: login,
        password: password,
      );
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> requestRegisterOtp({
    required String fullName,
    required String password,
    required String locationCode,
    String? email,
    String? phone,
  }) async {
    _setLoading(true);
    try {
      await _appServices.authService.requestRegisterOtp(
        fullName: fullName,
        password: password,
        locationCode: locationCode,
        email: email,
        phone: phone,
      );
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> register({
    required String fullName,
    required String password,
    required String locationCode,
    String? email,
    String? phone,
  }) async {
    _setLoading(true);
    try {
      final session = await _appServices.authService.register(
        fullName: fullName,
        password: password,
        locationCode: locationCode,
        email: email,
        phone: phone,
      );
      _user = session.user;
      _errorMessage = null;
      _connectSocket();
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<void> refreshProfile() async {
    try {
      _user = await _appServices.authService.getMe();
      _errorMessage = null;
      notifyListeners();
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
    }
  }

  Future<void> logout() async {
    _setLoading(true);
    try {
      await _appServices.authService.logout();
    } finally {
      _user = null;
      _errorMessage = null;
      _appServices.socketService.disconnect();
      _setLoading(false);
      notifyListeners();
    }
  }

  void _connectSocket() async {
    final token = await _appServices.tokenStore.readAccessToken();
    if (token != null) {
      _appServices.socketService.connect(token);
    }
  }

  void clearError() {
    if (_errorMessage == null) {
      return;
    }
    _errorMessage = null;
    notifyListeners();
  }

  void _setLoading(bool value) {
    if (_isLoading == value) {
      return;
    }
    _isLoading = value;
    notifyListeners();
  }

  Future<bool> requestForgotPasswordOtp(String login) async {
    _setLoading(true);
    try {
      await _appServices.authService.requestForgotPasswordOtp(login);
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> confirmForgotPassword({
    required String login,
    required String otpCode,
    required String newPassword,
  }) async {
    _setLoading(true);
    try {
      await _appServices.authService.confirmForgotPassword({
        "login": login,
        "otpCode": otpCode,
        "newPassword": newPassword,
      });
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<List<Map<String, dynamic>>> listSessions() async {
    _setLoading(true);
    try {
      final sessions = await _appServices.authService.listSessions();
      _errorMessage = null;
      return sessions;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return [];
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> revokeSession(String sessionId) async {
    _setLoading(true);
    try {
      await _appServices.authService.revokeSession(sessionId);
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> logoutAll() async {
    _setLoading(true);
    try {
      await _appServices.authService.logoutAll();
      _user = null;
      _errorMessage = null;
      _appServices.socketService.disconnect();
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> requestChangePasswordOtp() async {
    _setLoading(true);
    try {
      await _appServices.authService.requestChangePasswordOtp();
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
    required String otpCode,
  }) async {
    _setLoading(true);
    try {
      final result = await _appServices.authService.changePassword({
        "currentPassword": currentPassword,
        "newPassword": newPassword,
        "otpCode": otpCode,
      });
      _errorMessage = null;
      
      final bool currentSessionRevoked = result["currentSessionRevoked"] ?? false;
      if (currentSessionRevoked) {
        _user = null;
        _appServices.socketService.disconnect();
        notifyListeners();
      }
      
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> requestDeactivateAccountOtp() async {
    _setLoading(true);
    try {
      await _appServices.authService.requestDeactivateAccountOtp();
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> confirmDeactivateAccount(String otpCode) async {
    _setLoading(true);
    try {
      final result = await _appServices.authService.confirmDeactivateAccount(otpCode: otpCode);
      _errorMessage = null;
      
      final bool currentSessionRevoked = result["currentSessionRevoked"] ?? true;
      if (currentSessionRevoked) {
        _user = null;
        _appServices.socketService.disconnect();
        notifyListeners();
      }
      
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> requestDeleteAccountOtp() async {
    _setLoading(true);
    try {
      await _appServices.authService.requestDeleteAccountOtp();
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }

  Future<bool> confirmDeleteAccount({
    required String currentPassword,
    required String otpCode,
  }) async {
    _setLoading(true);
    try {
      final result = await _appServices.authService.confirmDeleteAccount(
        currentPassword: currentPassword,
        otpCode: otpCode,
      );
      _errorMessage = null;
      
      final bool currentSessionRevoked = result["currentSessionRevoked"] ?? true;
      if (currentSessionRevoked) {
        _user = null;
        _appServices.socketService.disconnect();
        notifyListeners();
      }
      
      return true;
    } catch (error) {
      _errorMessage = "$error";
      notifyListeners();
      return false;
    } finally {
      _setLoading(false);
    }
  }
}
