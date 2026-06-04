import "dart:async";
import "package:flutter/foundation.dart";
import "package:shared_preferences/shared_preferences.dart";

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
  bool _isDarkMode = false;
  StreamSubscription? _unreadMsgSub;
  StreamSubscription? _unreadReadSub;
  int _unreadMessagesCount = 0;
  String? _activeConversationId;
  int _activeTabIndex = 0;

  // Cấu hình thông báo lưu trữ cục bộ
  bool _pushNotificationEnabled = true;
  String _oneToOnePrivacyMode = "SHOW_ALL"; // SHOW_ALL, HIDE_CONTENT, ANONYMOUS
  bool _oneToOneSilentDebounce = true;
  String _groupNotificationFilter = "ALL_MESSAGES"; // ALL_MESSAGES, MENTIONS_ONLY, PINNED_ONLY
  bool _groupSoundEnabled = true;
  bool _priorityMentionsOverride = true;

  UserProfile? get user => _user;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isInitialized => _isInitialized;
  bool get isAuthenticated => _user != null;
  bool get isDarkMode => _isDarkMode;
  int get unreadMessagesCount => _unreadMessagesCount;
  String? get activeConversationId => _activeConversationId;
  int get activeTabIndex => _activeTabIndex;

  bool get pushNotificationEnabled => _pushNotificationEnabled;
  String get oneToOnePrivacyMode => _oneToOnePrivacyMode;
  bool get oneToOneSilentDebounce => _oneToOneSilentDebounce;
  String get groupNotificationFilter => _groupNotificationFilter;
  bool get groupSoundEnabled => _groupSoundEnabled;
  bool get priorityMentionsOverride => _priorityMentionsOverride;

  Future<void> setPushNotificationEnabled(bool value) async {
    _pushNotificationEnabled = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool("push_notification_enabled", value);
    } catch (e) {
      debugPrint("Failed to save push_notification_enabled pref: $e");
    }
  }

  Future<void> setOneToOnePrivacyMode(String value) async {
    _oneToOnePrivacyMode = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString("one_to_one_privacy_mode", value);
    } catch (e) {
      debugPrint("Failed to save one_to_one_privacy_mode pref: $e");
    }
  }

  Future<void> setOneToOneSilentDebounce(bool value) async {
    _oneToOneSilentDebounce = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool("one_to_one_silent_debounce", value);
    } catch (e) {
      debugPrint("Failed to save one_to_one_silent_debounce pref: $e");
    }
  }

  Future<void> setGroupNotificationFilter(String value) async {
    _groupNotificationFilter = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString("group_notification_filter", value);
    } catch (e) {
      debugPrint("Failed to save group_notification_filter pref: $e");
    }
  }

  Future<void> setGroupSoundEnabled(bool value) async {
    _groupSoundEnabled = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool("group_sound_enabled", value);
    } catch (e) {
      debugPrint("Failed to save group_sound_enabled pref: $e");
    }
  }

  Future<void> setPriorityMentionsOverride(bool value) async {
    _priorityMentionsOverride = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool("priority_mentions_override", value);
    } catch (e) {
      debugPrint("Failed to save priority_mentions_override pref: $e");
    }
  }

  void setActiveConversationId(String? value, {int? unreadCount}) {
    _activeConversationId = value;
    if (value != null && unreadCount != null && unreadCount > 0) {
      _unreadMessagesCount = (_unreadMessagesCount - unreadCount).clamp(0, 999999);
      notifyListeners();
    }
    fetchTotalUnreadCount();
  }

  void setActiveTabIndex(int index) {
    if (_activeTabIndex != index) {
      _activeTabIndex = index;
      notifyListeners();
    }
  }

  Future<void> toggleDarkMode(bool value) async {
    _isDarkMode = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool("is_dark_mode", value);
    } catch (e) {
      debugPrint("Failed to save dark mode pref: $e");
    }
  }

  Future<void> initialize() async {
    if (_isInitialized) {
      return;
    }
    _setLoading(true);

    try {
      final prefs = await SharedPreferences.getInstance();
      _isDarkMode = prefs.getBool("is_dark_mode") ?? false;
      _pushNotificationEnabled = prefs.getBool("push_notification_enabled") ?? true;
      _oneToOnePrivacyMode = prefs.getString("one_to_one_privacy_mode") ?? "SHOW_ALL";
      _oneToOneSilentDebounce = prefs.getBool("one_to_one_silent_debounce") ?? true;
      _groupNotificationFilter = prefs.getString("group_notification_filter") ?? "ALL_MESSAGES";
      _groupSoundEnabled = prefs.getBool("group_sound_enabled") ?? true;
      _priorityMentionsOverride = prefs.getBool("priority_mentions_override") ?? true;
    } catch (e) {
      debugPrint("Failed to load prefs: $e");
    }

    try {
      _user = await _appServices.authService.getMe();
      if (_user != null) {
        _appServices.webRTCService.setLocalUserId(_user!.id);
        _appServices.pushNotificationService.initializeAndRegister();
        _setupUnreadListeners();
        fetchTotalUnreadCount();
      }
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
      if (_user != null) {
        _appServices.webRTCService.setLocalUserId(_user!.id);
        _appServices.pushNotificationService.initializeAndRegister();
        _setupUnreadListeners();
        fetchTotalUnreadCount();
      }
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
      if (_user != null) {
        _appServices.webRTCService.setLocalUserId(_user!.id);
        _appServices.pushNotificationService.initializeAndRegister();
        _setupUnreadListeners();
        fetchTotalUnreadCount();
      }
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
      if (_user != null) {
        _appServices.webRTCService.setLocalUserId(_user!.id);
        _appServices.pushNotificationService.initializeAndRegister();
        _setupUnreadListeners();
        fetchTotalUnreadCount();
      }
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
      if (_user != null) {
        _appServices.webRTCService.setLocalUserId(_user!.id);
      }
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
      _unreadMsgSub?.cancel();
      _unreadReadSub?.cancel();
      await _appServices.pushNotificationService.unregisterDevice();
      await _appServices.authService.logout();
    } finally {
      _user = null;
      _errorMessage = null;
      _unreadMessagesCount = 0;
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
      _unreadMsgSub?.cancel();
      _unreadReadSub?.cancel();
      await _appServices.authService.logoutAll();
      _user = null;
      _errorMessage = null;
      _unreadMessagesCount = 0;
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

  Future<void> fetchTotalUnreadCount() async {
    if (_user == null) return;
    try {
      final result = await _appServices.conversationService.listConversations(
        unreadOnly: true,
        limit: 100,
      );
      int sum = 0;
      for (final conv in result.items) {
        sum += conv.unreadCount;
      }
      _unreadMessagesCount = sum;
      notifyListeners();
    } catch (e) {
      debugPrint("Error fetching total unread count: $e");
    }
  }

  void _setupUnreadListeners() {
    _unreadMsgSub?.cancel();
    _unreadReadSub?.cancel();

    _unreadMsgSub = _appServices.socketService.onMessageCreated.listen((msg) {
      if (_user != null && msg.senderId != _user!.id) {
        if (msg.conversationId != _activeConversationId) {
          _unreadMessagesCount++;
          notifyListeners();
        }
      }
    });

    _unreadReadSub = _appServices.socketService.onConversationRead.listen((data) {
      final readByUserId = data["readByUserId"]?.toString() ?? data["userId"]?.toString();
      if (_user != null && readByUserId == _user!.id) {
        fetchTotalUnreadCount();
      }
    });
  }

  @override
  void dispose() {
    _unreadMsgSub?.cancel();
    _unreadReadSub?.cancel();
    super.dispose();
  }
}
