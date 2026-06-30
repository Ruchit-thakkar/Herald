import fs from 'fs';
import path from 'path';

export interface EmojiItem {
  char: string;
  name: string;
  group: string;
  subgroup: string;
  codePoints: string;
}

export interface EmojiGroup {
  name: string;
  emojis: EmojiItem[];
}

let cachedEmojis: EmojiGroup[] = [];

export function getEmojis(): EmojiGroup[] {
  if (cachedEmojis.length > 0) {
    return cachedEmojis;
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'emoji-test.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');

    let currentGroup = '';
    let currentSubgroup = '';
    const groupsMap: { [groupName: string]: EmojiItem[] } = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 1. Group definition
      if (trimmed.startsWith('# group:')) {
        currentGroup = trimmed.substring('# group:'.length).trim();
        continue;
      }

      // 2. Subgroup definition
      if (trimmed.startsWith('# subgroup:')) {
        currentSubgroup = trimmed.substring('# subgroup:'.length).trim();
        continue;
      }

      // 3. Ignore general comments and metadata
      if (trimmed.startsWith('#')) {
        continue;
      }

      // 4. Parse emoji lines
      // Format: code points; status # emoji name
      // e.g. 1F600                                                  ; fully-qualified     # 😀 E1.0 grinning face
      const semiIndex = trimmed.indexOf(';');
      const hashIndex = trimmed.indexOf('#');
      if (semiIndex === -1 || hashIndex === -1) continue;

      const statusPart = trimmed.substring(semiIndex + 1, hashIndex).trim();
      if (statusPart !== 'fully-qualified') continue;

      const codePoints = trimmed.substring(0, semiIndex).trim();
      const commentPart = trimmed.substring(hashIndex + 1).trim();

      // Extract actual emoji character (the first space-separated token in the comment)
      const spaceIndex = commentPart.indexOf(' ');
      if (spaceIndex === -1) continue;

      const char = commentPart.substring(0, spaceIndex).trim();

      // Extract description name by skipping the unicode version part (e.g. E1.0, E15.1, etc.)
      const namePart = commentPart.substring(spaceIndex + 1).trim();
      const nextSpaceIndex = namePart.indexOf(' ');
      const name = nextSpaceIndex !== -1 ? namePart.substring(nextSpaceIndex + 1).trim() : namePart;

      const emoji: EmojiItem = {
        char,
        name,
        group: currentGroup,
        subgroup: currentSubgroup,
        codePoints
      };

      if (!groupsMap[currentGroup]) {
        groupsMap[currentGroup] = [];
      }
      groupsMap[currentGroup].push(emoji);
    }

    // Convert map to ordered groups array preserving CLDR ordering
    const result: EmojiGroup[] = [];
    
    // We want to loop over the keys in insertion order (which ES6 maintains for string keys)
    for (const groupName of Object.keys(groupsMap)) {
      result.push({
        name: groupName,
        emojis: groupsMap[groupName]
      });
    }

    cachedEmojis = result;
    return result;
  } catch (error) {
    console.error('Failed to parse emoji-test.txt:', error);
    return [];
  }
}
