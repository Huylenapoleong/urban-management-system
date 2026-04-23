const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/(citizen)/chat/index.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Step 1: Remove searchField and filterRow from headerSticky
// Find the pattern and remove it
const searchFieldRegex = /\n\s*<View style=\{styles\.searchField\}>[\s\S]*?<\/View>\s*<View style=\{styles\.filterRow\}>[\s\S]*?<\/View>\s*/;
content = content.replace(searchFieldRegex, '\n      ');

// Step 2: Add ListHeaderComponent and onScroll to FlatList
const searchComponent = `          ListHeaderComponent={
            showSearchBar ? (
              <View style={styles.searchSection}>
                <View style={styles.searchField}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Mở Meta AI"
                    onPress={openAiChatbot}
                    style={({ pressed }) => [styles.searchAiButton, pressed ? styles.pressed : null]}
                  >
                    <Ionicons name="sparkles" size={20} color={colors.secondary} />
                  </Pressable>
                  <TextInput
                    placeholder="Hỏi Meta AI hoặc tìm kiếm"
                    placeholderTextColor="#6b7280"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={styles.searchInput}
                  />
                </View>
              </View>
            ) : null
          }
          onScroll={handleScroll}
          scrollEventThrottle={16}
          `;

content = content.replace(
  /(\s*<FlatList\s+data=\{filteredConversations\}\s+keyExtractor=)/,
  `          ListHeaderComponent={
            showSearchBar ? (
              <View style={styles.searchSection}>
                <View style={styles.searchField}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Mở Meta AI"
                    onPress={openAiChatbot}
                    style={({ pressed }) => [styles.searchAiButton, pressed ? styles.pressed : null]}
                  >
                    <Ionicons name="sparkles" size={20} color={colors.secondary} />
                  </Pressable>
                  <TextInput
                    placeholder="Hỏi Meta AI hoặc tìm kiếm"
                    placeholderTextColor="#6b7280"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    style={styles.searchInput}
                  />
                </View>
              </View>
            ) : null
          }
          onScroll={handleScroll}
          scrollEventThrottle={16}
          $1`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Header refactored successfully!');
