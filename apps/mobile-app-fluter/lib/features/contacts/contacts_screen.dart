import "package:flutter/material.dart";
import "package:provider/provider.dart";
import "../../services/app_services.dart";
import "widgets/friend_list_tab.dart";
import "widgets/request_list_tab.dart";
import "widgets/discover_tab.dart";
import "widgets/group_list_tab.dart";
import "../groups/create_group_screen.dart";

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text("Bạn bè", style: TextStyle(color: Color(0xFF1E1B4B), fontWeight: FontWeight.bold, fontSize: 22)),
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: Color(0xFF1E1B4B)),
        actions: [
          IconButton(
            icon: const Icon(Icons.group_add_outlined, size: 28),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const CreateGroupScreen()),
              );
            },
          ),
          const SizedBox(width: 8),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF7C3AED),
          unselectedLabelColor: const Color(0xFF64748B),
          indicatorColor: const Color(0xFF7C3AED),
          indicatorWeight: 3,
          indicatorSize: TabBarIndicatorSize.label,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
          tabs: const [
            Tab(text: "Bạn bè"),
            Tab(text: "Nhóm"),
            Tab(text: "Yêu cầu"),
            Tab(text: "Khám phá"),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          FriendListTab(userService: context.read<AppServices>().userService),
          GroupListTab(groupService: context.read<AppServices>().groupService),
          RequestListTab(userService: context.read<AppServices>().userService),
          DiscoverTab(userService: context.read<AppServices>().userService),
        ],
      ),
    );
  }
}
