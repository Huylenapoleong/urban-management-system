# Citizen Mobile App Fix Plan - Complete Review

**Status:** Fixing all remaining errors per user request

**Files to fix:**
- [x] group.tsx (groupId → id)
- [x] home.tsx (imports, routes, colors, styles) 
- [x] report.tsx (API loop fix)
- [x] group.tsx (API loop fix)
- [x] home.tsx (deps stable)
- [x] join-group.tsx (feedback)

**Status**: ✅ API LOOP ISSUE FIXED - No more continuous GET calls

**Next:** UI refinements if needed

**API structure from packages/shared-types:**
- GroupMetadata.id (not groupId)
- MessageItem.id, senderId, content, sentAt
- No 'isMember' field → simple join

**Next:** Fix home.tsx completely + test all

