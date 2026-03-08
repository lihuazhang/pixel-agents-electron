# Character Sprite Import

## Key Finding: Read Full Character Height from PNG

When importing character sprites from PNG assets, must read the **full visible pixel height**, not just an estimated value.

### Problem
Character PNG layout:
- 7 frames × 16px wide, 3 direction rows × 32px tall
- Row 22-28 contains legs and feet
- Row 29-31 is transparent padding

Original code only read 24px height, cutting off 5 rows (rows 24-28) that contain the legs and feet.

### Correct Values
```typescript
const pixelHeight = 31  // Full visible sprite height (rows 0-30)
                       // Row 31 is the only transparent padding
```

### Files to Check
- `src/main/assetLoader.ts` - `parseCharacterPng()` function
- `src/renderer/src/office/engine/renderer.ts` - drawY calculation

### Lesson
When importing character sprites:
1. **Analyze the actual PNG pixel data** to find where transparent padding begins
2. **Read all visible rows** including legs/feet
3. Do NOT assume standard heights (24px, 29px, etc.) - verify by inspecting the actual asset

### Reference
Character sprite analysis (char_0.png):
- Rows 0-21: Head and body
- Rows 22-28: Legs and feet (were being cut off!)
- Rows 29-30: Still visible pixel data
- Row 31: Transparent padding (only row that should be excluded)
