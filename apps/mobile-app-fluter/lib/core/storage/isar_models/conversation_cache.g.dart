// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_cache.dart';

// **************************************************************************
// IsarCollectionGenerator
// **************************************************************************

// coverage:ignore-file
// ignore_for_file: duplicate_ignore, non_constant_identifier_names, constant_identifier_names, invalid_use_of_protected_member, unnecessary_cast, prefer_const_constructors, lines_longer_than_80_chars, require_trailing_commas, inference_failure_on_function_invocation, unnecessary_parenthesis, unnecessary_raw_strings, unnecessary_null_checks, join_return_with_assignment, prefer_final_locals, avoid_js_rounded_ints, avoid_positional_boolean_parameters, always_specify_types

extension GetConversationCacheCollection on Isar {
  IsarCollection<ConversationCache> get conversationCaches => this.collection();
}

const ConversationCacheSchema = CollectionSchema(
  name: r'ConversationCache',
  id: 1699256921370683829,
  properties: {
    r'conversationId': PropertySchema(
      id: 0,
      name: r'conversationId',
      type: IsarType.string,
    ),
    r'groupName': PropertySchema(
      id: 1,
      name: r'groupName',
      type: IsarType.string,
    ),
    r'isGroup': PropertySchema(
      id: 2,
      name: r'isGroup',
      type: IsarType.bool,
    ),
    r'isPinned': PropertySchema(
      id: 3,
      name: r'isPinned',
      type: IsarType.bool,
    ),
    r'lastMessagePreview': PropertySchema(
      id: 4,
      name: r'lastMessagePreview',
      type: IsarType.string,
    ),
    r'lastSenderName': PropertySchema(
      id: 5,
      name: r'lastSenderName',
      type: IsarType.string,
    ),
    r'mutedUntil': PropertySchema(
      id: 6,
      name: r'mutedUntil',
      type: IsarType.string,
    ),
    r'requestStatus': PropertySchema(
      id: 7,
      name: r'requestStatus',
      type: IsarType.string,
    ),
    r'unreadCount': PropertySchema(
      id: 8,
      name: r'unreadCount',
      type: IsarType.long,
    ),
    r'updatedAt': PropertySchema(
      id: 9,
      name: r'updatedAt',
      type: IsarType.string,
    )
  },
  estimateSize: _conversationCacheEstimateSize,
  serialize: _conversationCacheSerialize,
  deserialize: _conversationCacheDeserialize,
  deserializeProp: _conversationCacheDeserializeProp,
  idName: r'id',
  indexes: {
    r'conversationId': IndexSchema(
      id: 2945908346256754300,
      name: r'conversationId',
      unique: true,
      replace: true,
      properties: [
        IndexPropertySchema(
          name: r'conversationId',
          type: IndexType.hash,
          caseSensitive: true,
        )
      ],
    )
  },
  links: {},
  embeddedSchemas: {},
  getId: _conversationCacheGetId,
  getLinks: _conversationCacheGetLinks,
  attach: _conversationCacheAttach,
  version: '3.1.0+1',
);

int _conversationCacheEstimateSize(
  ConversationCache object,
  List<int> offsets,
  Map<Type, List<int>> allOffsets,
) {
  var bytesCount = offsets.last;
  bytesCount += 3 + object.conversationId.length * 3;
  bytesCount += 3 + object.groupName.length * 3;
  {
    final value = object.lastMessagePreview;
    if (value != null) {
      bytesCount += 3 + value.length * 3;
    }
  }
  {
    final value = object.lastSenderName;
    if (value != null) {
      bytesCount += 3 + value.length * 3;
    }
  }
  {
    final value = object.mutedUntil;
    if (value != null) {
      bytesCount += 3 + value.length * 3;
    }
  }
  {
    final value = object.requestStatus;
    if (value != null) {
      bytesCount += 3 + value.length * 3;
    }
  }
  bytesCount += 3 + object.updatedAt.length * 3;
  return bytesCount;
}

void _conversationCacheSerialize(
  ConversationCache object,
  IsarWriter writer,
  List<int> offsets,
  Map<Type, List<int>> allOffsets,
) {
  writer.writeString(offsets[0], object.conversationId);
  writer.writeString(offsets[1], object.groupName);
  writer.writeBool(offsets[2], object.isGroup);
  writer.writeBool(offsets[3], object.isPinned);
  writer.writeString(offsets[4], object.lastMessagePreview);
  writer.writeString(offsets[5], object.lastSenderName);
  writer.writeString(offsets[6], object.mutedUntil);
  writer.writeString(offsets[7], object.requestStatus);
  writer.writeLong(offsets[8], object.unreadCount);
  writer.writeString(offsets[9], object.updatedAt);
}

ConversationCache _conversationCacheDeserialize(
  Id id,
  IsarReader reader,
  List<int> offsets,
  Map<Type, List<int>> allOffsets,
) {
  final object = ConversationCache();
  object.conversationId = reader.readString(offsets[0]);
  object.groupName = reader.readString(offsets[1]);
  object.id = id;
  object.isGroup = reader.readBool(offsets[2]);
  object.isPinned = reader.readBool(offsets[3]);
  object.lastMessagePreview = reader.readStringOrNull(offsets[4]);
  object.lastSenderName = reader.readStringOrNull(offsets[5]);
  object.mutedUntil = reader.readStringOrNull(offsets[6]);
  object.requestStatus = reader.readStringOrNull(offsets[7]);
  object.unreadCount = reader.readLong(offsets[8]);
  object.updatedAt = reader.readString(offsets[9]);
  return object;
}

P _conversationCacheDeserializeProp<P>(
  IsarReader reader,
  int propertyId,
  int offset,
  Map<Type, List<int>> allOffsets,
) {
  switch (propertyId) {
    case 0:
      return (reader.readString(offset)) as P;
    case 1:
      return (reader.readString(offset)) as P;
    case 2:
      return (reader.readBool(offset)) as P;
    case 3:
      return (reader.readBool(offset)) as P;
    case 4:
      return (reader.readStringOrNull(offset)) as P;
    case 5:
      return (reader.readStringOrNull(offset)) as P;
    case 6:
      return (reader.readStringOrNull(offset)) as P;
    case 7:
      return (reader.readStringOrNull(offset)) as P;
    case 8:
      return (reader.readLong(offset)) as P;
    case 9:
      return (reader.readString(offset)) as P;
    default:
      throw IsarError('Unknown property with id $propertyId');
  }
}

Id _conversationCacheGetId(ConversationCache object) {
  return object.id;
}

List<IsarLinkBase<dynamic>> _conversationCacheGetLinks(
    ConversationCache object) {
  return [];
}

void _conversationCacheAttach(
    IsarCollection<dynamic> col, Id id, ConversationCache object) {
  object.id = id;
}

extension ConversationCacheByIndex on IsarCollection<ConversationCache> {
  Future<ConversationCache?> getByConversationId(String conversationId) {
    return getByIndex(r'conversationId', [conversationId]);
  }

  ConversationCache? getByConversationIdSync(String conversationId) {
    return getByIndexSync(r'conversationId', [conversationId]);
  }

  Future<bool> deleteByConversationId(String conversationId) {
    return deleteByIndex(r'conversationId', [conversationId]);
  }

  bool deleteByConversationIdSync(String conversationId) {
    return deleteByIndexSync(r'conversationId', [conversationId]);
  }

  Future<List<ConversationCache?>> getAllByConversationId(
      List<String> conversationIdValues) {
    final values = conversationIdValues.map((e) => [e]).toList();
    return getAllByIndex(r'conversationId', values);
  }

  List<ConversationCache?> getAllByConversationIdSync(
      List<String> conversationIdValues) {
    final values = conversationIdValues.map((e) => [e]).toList();
    return getAllByIndexSync(r'conversationId', values);
  }

  Future<int> deleteAllByConversationId(List<String> conversationIdValues) {
    final values = conversationIdValues.map((e) => [e]).toList();
    return deleteAllByIndex(r'conversationId', values);
  }

  int deleteAllByConversationIdSync(List<String> conversationIdValues) {
    final values = conversationIdValues.map((e) => [e]).toList();
    return deleteAllByIndexSync(r'conversationId', values);
  }

  Future<Id> putByConversationId(ConversationCache object) {
    return putByIndex(r'conversationId', object);
  }

  Id putByConversationIdSync(ConversationCache object,
      {bool saveLinks = true}) {
    return putByIndexSync(r'conversationId', object, saveLinks: saveLinks);
  }

  Future<List<Id>> putAllByConversationId(List<ConversationCache> objects) {
    return putAllByIndex(r'conversationId', objects);
  }

  List<Id> putAllByConversationIdSync(List<ConversationCache> objects,
      {bool saveLinks = true}) {
    return putAllByIndexSync(r'conversationId', objects, saveLinks: saveLinks);
  }
}

extension ConversationCacheQueryWhereSort
    on QueryBuilder<ConversationCache, ConversationCache, QWhere> {
  QueryBuilder<ConversationCache, ConversationCache, QAfterWhere> anyId() {
    return QueryBuilder.apply(this, (query) {
      return query.addWhereClause(const IdWhereClause.any());
    });
  }
}

extension ConversationCacheQueryWhere
    on QueryBuilder<ConversationCache, ConversationCache, QWhereClause> {
  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      idEqualTo(Id id) {
    return QueryBuilder.apply(this, (query) {
      return query.addWhereClause(IdWhereClause.between(
        lower: id,
        upper: id,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      idNotEqualTo(Id id) {
    return QueryBuilder.apply(this, (query) {
      if (query.whereSort == Sort.asc) {
        return query
            .addWhereClause(
              IdWhereClause.lessThan(upper: id, includeUpper: false),
            )
            .addWhereClause(
              IdWhereClause.greaterThan(lower: id, includeLower: false),
            );
      } else {
        return query
            .addWhereClause(
              IdWhereClause.greaterThan(lower: id, includeLower: false),
            )
            .addWhereClause(
              IdWhereClause.lessThan(upper: id, includeUpper: false),
            );
      }
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      idGreaterThan(Id id, {bool include = false}) {
    return QueryBuilder.apply(this, (query) {
      return query.addWhereClause(
        IdWhereClause.greaterThan(lower: id, includeLower: include),
      );
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      idLessThan(Id id, {bool include = false}) {
    return QueryBuilder.apply(this, (query) {
      return query.addWhereClause(
        IdWhereClause.lessThan(upper: id, includeUpper: include),
      );
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      idBetween(
    Id lowerId,
    Id upperId, {
    bool includeLower = true,
    bool includeUpper = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addWhereClause(IdWhereClause.between(
        lower: lowerId,
        includeLower: includeLower,
        upper: upperId,
        includeUpper: includeUpper,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      conversationIdEqualTo(String conversationId) {
    return QueryBuilder.apply(this, (query) {
      return query.addWhereClause(IndexWhereClause.equalTo(
        indexName: r'conversationId',
        value: [conversationId],
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterWhereClause>
      conversationIdNotEqualTo(String conversationId) {
    return QueryBuilder.apply(this, (query) {
      if (query.whereSort == Sort.asc) {
        return query
            .addWhereClause(IndexWhereClause.between(
              indexName: r'conversationId',
              lower: [],
              upper: [conversationId],
              includeUpper: false,
            ))
            .addWhereClause(IndexWhereClause.between(
              indexName: r'conversationId',
              lower: [conversationId],
              includeLower: false,
              upper: [],
            ));
      } else {
        return query
            .addWhereClause(IndexWhereClause.between(
              indexName: r'conversationId',
              lower: [conversationId],
              includeLower: false,
              upper: [],
            ))
            .addWhereClause(IndexWhereClause.between(
              indexName: r'conversationId',
              lower: [],
              upper: [conversationId],
              includeUpper: false,
            ));
      }
    });
  }
}

extension ConversationCacheQueryFilter
    on QueryBuilder<ConversationCache, ConversationCache, QFilterCondition> {
  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdEqualTo(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'conversationId',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdGreaterThan(
    String value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'conversationId',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdLessThan(
    String value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'conversationId',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdBetween(
    String lower,
    String upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'conversationId',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'conversationId',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'conversationId',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'conversationId',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'conversationId',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'conversationId',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      conversationIdIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'conversationId',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameEqualTo(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'groupName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameGreaterThan(
    String value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'groupName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameLessThan(
    String value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'groupName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameBetween(
    String lower,
    String upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'groupName',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'groupName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'groupName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'groupName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'groupName',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'groupName',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      groupNameIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'groupName',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      idEqualTo(Id value) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'id',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      idGreaterThan(
    Id value, {
    bool include = false,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'id',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      idLessThan(
    Id value, {
    bool include = false,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'id',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      idBetween(
    Id lower,
    Id upper, {
    bool includeLower = true,
    bool includeUpper = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'id',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      isGroupEqualTo(bool value) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'isGroup',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      isPinnedEqualTo(bool value) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'isPinned',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewIsNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNull(
        property: r'lastMessagePreview',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewIsNotNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNotNull(
        property: r'lastMessagePreview',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewEqualTo(
    String? value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'lastMessagePreview',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewGreaterThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'lastMessagePreview',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewLessThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'lastMessagePreview',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewBetween(
    String? lower,
    String? upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'lastMessagePreview',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'lastMessagePreview',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'lastMessagePreview',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'lastMessagePreview',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'lastMessagePreview',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'lastMessagePreview',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastMessagePreviewIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'lastMessagePreview',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameIsNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNull(
        property: r'lastSenderName',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameIsNotNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNotNull(
        property: r'lastSenderName',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameEqualTo(
    String? value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'lastSenderName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameGreaterThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'lastSenderName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameLessThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'lastSenderName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameBetween(
    String? lower,
    String? upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'lastSenderName',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'lastSenderName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'lastSenderName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'lastSenderName',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'lastSenderName',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'lastSenderName',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      lastSenderNameIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'lastSenderName',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilIsNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNull(
        property: r'mutedUntil',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilIsNotNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNotNull(
        property: r'mutedUntil',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilEqualTo(
    String? value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'mutedUntil',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilGreaterThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'mutedUntil',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilLessThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'mutedUntil',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilBetween(
    String? lower,
    String? upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'mutedUntil',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'mutedUntil',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'mutedUntil',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'mutedUntil',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'mutedUntil',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'mutedUntil',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      mutedUntilIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'mutedUntil',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusIsNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNull(
        property: r'requestStatus',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusIsNotNull() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(const FilterCondition.isNotNull(
        property: r'requestStatus',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusEqualTo(
    String? value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'requestStatus',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusGreaterThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'requestStatus',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusLessThan(
    String? value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'requestStatus',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusBetween(
    String? lower,
    String? upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'requestStatus',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'requestStatus',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'requestStatus',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'requestStatus',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'requestStatus',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'requestStatus',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      requestStatusIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'requestStatus',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      unreadCountEqualTo(int value) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'unreadCount',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      unreadCountGreaterThan(
    int value, {
    bool include = false,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'unreadCount',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      unreadCountLessThan(
    int value, {
    bool include = false,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'unreadCount',
        value: value,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      unreadCountBetween(
    int lower,
    int upper, {
    bool includeLower = true,
    bool includeUpper = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'unreadCount',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtEqualTo(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'updatedAt',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtGreaterThan(
    String value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        include: include,
        property: r'updatedAt',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtLessThan(
    String value, {
    bool include = false,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.lessThan(
        include: include,
        property: r'updatedAt',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtBetween(
    String lower,
    String upper, {
    bool includeLower = true,
    bool includeUpper = true,
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.between(
        property: r'updatedAt',
        lower: lower,
        includeLower: includeLower,
        upper: upper,
        includeUpper: includeUpper,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtStartsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.startsWith(
        property: r'updatedAt',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtEndsWith(
    String value, {
    bool caseSensitive = true,
  }) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.endsWith(
        property: r'updatedAt',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtContains(String value, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.contains(
        property: r'updatedAt',
        value: value,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtMatches(String pattern, {bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.matches(
        property: r'updatedAt',
        wildcard: pattern,
        caseSensitive: caseSensitive,
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtIsEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.equalTo(
        property: r'updatedAt',
        value: '',
      ));
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterFilterCondition>
      updatedAtIsNotEmpty() {
    return QueryBuilder.apply(this, (query) {
      return query.addFilterCondition(FilterCondition.greaterThan(
        property: r'updatedAt',
        value: '',
      ));
    });
  }
}

extension ConversationCacheQueryObject
    on QueryBuilder<ConversationCache, ConversationCache, QFilterCondition> {}

extension ConversationCacheQueryLinks
    on QueryBuilder<ConversationCache, ConversationCache, QFilterCondition> {}

extension ConversationCacheQuerySortBy
    on QueryBuilder<ConversationCache, ConversationCache, QSortBy> {
  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByConversationId() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'conversationId', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByConversationIdDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'conversationId', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByGroupName() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'groupName', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByGroupNameDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'groupName', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByIsGroup() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isGroup', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByIsGroupDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isGroup', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByIsPinned() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isPinned', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByIsPinnedDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isPinned', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByLastMessagePreview() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastMessagePreview', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByLastMessagePreviewDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastMessagePreview', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByLastSenderName() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastSenderName', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByLastSenderNameDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastSenderName', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByMutedUntil() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'mutedUntil', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByMutedUntilDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'mutedUntil', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByRequestStatus() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'requestStatus', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByRequestStatusDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'requestStatus', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByUnreadCount() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'unreadCount', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByUnreadCountDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'unreadCount', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByUpdatedAt() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'updatedAt', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      sortByUpdatedAtDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'updatedAt', Sort.desc);
    });
  }
}

extension ConversationCacheQuerySortThenBy
    on QueryBuilder<ConversationCache, ConversationCache, QSortThenBy> {
  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByConversationId() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'conversationId', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByConversationIdDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'conversationId', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByGroupName() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'groupName', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByGroupNameDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'groupName', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy> thenById() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'id', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByIdDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'id', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByIsGroup() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isGroup', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByIsGroupDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isGroup', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByIsPinned() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isPinned', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByIsPinnedDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'isPinned', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByLastMessagePreview() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastMessagePreview', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByLastMessagePreviewDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastMessagePreview', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByLastSenderName() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastSenderName', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByLastSenderNameDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'lastSenderName', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByMutedUntil() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'mutedUntil', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByMutedUntilDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'mutedUntil', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByRequestStatus() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'requestStatus', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByRequestStatusDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'requestStatus', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByUnreadCount() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'unreadCount', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByUnreadCountDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'unreadCount', Sort.desc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByUpdatedAt() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'updatedAt', Sort.asc);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QAfterSortBy>
      thenByUpdatedAtDesc() {
    return QueryBuilder.apply(this, (query) {
      return query.addSortBy(r'updatedAt', Sort.desc);
    });
  }
}

extension ConversationCacheQueryWhereDistinct
    on QueryBuilder<ConversationCache, ConversationCache, QDistinct> {
  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByConversationId({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'conversationId',
          caseSensitive: caseSensitive);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByGroupName({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'groupName', caseSensitive: caseSensitive);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByIsGroup() {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'isGroup');
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByIsPinned() {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'isPinned');
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByLastMessagePreview({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'lastMessagePreview',
          caseSensitive: caseSensitive);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByLastSenderName({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'lastSenderName',
          caseSensitive: caseSensitive);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByMutedUntil({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'mutedUntil', caseSensitive: caseSensitive);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByRequestStatus({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'requestStatus',
          caseSensitive: caseSensitive);
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByUnreadCount() {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'unreadCount');
    });
  }

  QueryBuilder<ConversationCache, ConversationCache, QDistinct>
      distinctByUpdatedAt({bool caseSensitive = true}) {
    return QueryBuilder.apply(this, (query) {
      return query.addDistinctBy(r'updatedAt', caseSensitive: caseSensitive);
    });
  }
}

extension ConversationCacheQueryProperty
    on QueryBuilder<ConversationCache, ConversationCache, QQueryProperty> {
  QueryBuilder<ConversationCache, int, QQueryOperations> idProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'id');
    });
  }

  QueryBuilder<ConversationCache, String, QQueryOperations>
      conversationIdProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'conversationId');
    });
  }

  QueryBuilder<ConversationCache, String, QQueryOperations>
      groupNameProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'groupName');
    });
  }

  QueryBuilder<ConversationCache, bool, QQueryOperations> isGroupProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'isGroup');
    });
  }

  QueryBuilder<ConversationCache, bool, QQueryOperations> isPinnedProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'isPinned');
    });
  }

  QueryBuilder<ConversationCache, String?, QQueryOperations>
      lastMessagePreviewProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'lastMessagePreview');
    });
  }

  QueryBuilder<ConversationCache, String?, QQueryOperations>
      lastSenderNameProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'lastSenderName');
    });
  }

  QueryBuilder<ConversationCache, String?, QQueryOperations>
      mutedUntilProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'mutedUntil');
    });
  }

  QueryBuilder<ConversationCache, String?, QQueryOperations>
      requestStatusProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'requestStatus');
    });
  }

  QueryBuilder<ConversationCache, int, QQueryOperations> unreadCountProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'unreadCount');
    });
  }

  QueryBuilder<ConversationCache, String, QQueryOperations>
      updatedAtProperty() {
    return QueryBuilder.apply(this, (query) {
      return query.addPropertyName(r'updatedAt');
    });
  }
}
