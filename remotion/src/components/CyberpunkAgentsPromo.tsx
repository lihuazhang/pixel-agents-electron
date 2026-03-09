import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Easing,
  staticFile,
} from "remotion";

// Pixel Agents Promo - 6 characters, single frame each
// 5 seconds, 30fps = 150 frames

const COLORS = {
  bg: "#0a0e1a",           // Dark navy
  grid: "#1a2342",         // Subtle blue grid
  textGreen: "#00ff41",    // Matrix green
  textWhite: "#c9d1d9",    // Light text
  glowGreen: "#00ff4188",  // Green glow
};

// 6 characters with proper single-frame crop
// char_0: 200x171, 2 frames per row (100px each), 3 rows (57px each) - first frame: 100x57
// char_1-5: 112x96, 4 frames per row (28px each), 4 rows (24px each) - first frame: 28x24
const CHARACTERS = [
  { id: 0, sprite: staticFile("characters/char_0.png"), frameW: 14, frameH: 33, spriteW: 112, spriteH: 96, scale: 3, bubble: "💭" },
  { id: 1, sprite: staticFile("characters/char_1.png"), frameW: 14, frameH: 33, spriteW: 112, spriteH: 96, scale: 3, bubble: "⌨️" },
  { id: 2, sprite: staticFile("characters/char_2.png"), frameW: 14, frameH: 33, spriteW: 112, spriteH: 96, scale: 3, bubble: "🤔" },
  { id: 3, sprite: staticFile("characters/char_3.png"), frameW: 14, frameH: 33, spriteW: 112, spriteH: 96, scale: 3, bubble: "🐟" },
  { id: 4, sprite: staticFile("characters/char_4.png"), frameW: 14, frameH: 33, spriteW: 112, spriteH: 96, scale: 3, bubble: "✨" },
  { id: 5, sprite: staticFile("characters/char_5.png"), frameW: 14, frameH: 33, spriteW: 112, spriteH: 96, scale: 3, bubble: "🚀" },
];

interface PixelAgentsPromoProps {
  title?: string;
}

export const CyberpunkAgentsPromo: React.FC<PixelAgentsPromoProps> = ({
  title = "PIXEL AGENTS",
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        fontFamily: "'Courier New', monospace",
        overflow: "hidden",
      }}
    >
      {/* Blue grid background */}
      <PixelGrid />

      {/* Title section */}
      <TitleSection frame={frame} title={title} />

      {/* 6 Characters row - falling in */}
      <CharactersRow frame={frame} />

      {/* Status bar */}
      <StatusBar frame={frame} />
    </AbsoluteFill>
  );
};

// Blue pixel grid background
const PixelGrid: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `
          linear-gradient(${COLORS.grid} 1px, transparent 1px),
          linear-gradient(90deg, ${COLORS.grid} 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px",
        opacity: 0.5,
      }}
    />
  );
};

// Title with green glow
const TitleSection: React.FC<{ frame: number; title: string }> = ({ frame, title }) => {
  const progress = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowIntensity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pulse = 1 + Math.sin(frame * 0.1) * 0.05;

  return (
    <div
      style={{
        position: "absolute",
        top: "15%",
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: progress,
      }}
    >
      <h1
        style={{
          fontSize: "64px",
          fontWeight: 700,
          margin: 0,
          letterSpacing: "0.15em",
          color: COLORS.textGreen,
          textShadow: `
            0 0 ${10 * glowIntensity * pulse}px ${COLORS.glowGreen},
            0 0 ${20 * glowIntensity * pulse}px ${COLORS.glowGreen},
            0 0 ${40 * glowIntensity * pulse}px ${COLORS.glowGreen}
          `,
        }}
      >
        {title}
      </h1>

      <p
        style={{
          fontSize: "16px",
          color: COLORS.textWhite,
          margin: "12px 0 0",
          letterSpacing: "0.1em",
          opacity: interpolate(frame, [15, 35], [0, 0.7], { extrapolateRight: "clamp" }),
        }}
      >
        Your Claude Code Companion
      </p>
    </div>
  );
};

// 6 Characters in a row - single frame, falling from above
const CharactersRow: React.FC<{ frame: number }> = ({ frame }) => {
  const centerX = 1920 / 2;
  const spacing = 80;
  const startX = centerX - ((CHARACTERS.length - 1) * spacing) / 2;

  return (
    <div
      style={{
        position: "absolute",
        top: "55%",
        left: 0,
        right: 0,
        height: "200px",
      }}
    >
      {CHARACTERS.map((char, index) => {
        // Staggered entrance - falling from above
        const charStartFrame = 25 + index * 12;
        const fallDuration = 30;
        const charProgress = interpolate(frame, [charStartFrame, charStartFrame + fallDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Fall from above with smooth ease (no bounce)
        const groundY = 0;
        const startY = -200;
        let charY: number;

        if (charProgress < 1) {
          const easedProgress = interpolate(charProgress, [0, 1], [0, 1], {
            easing: Easing.out(Easing.cubic),
          });
          charY = interpolate(easedProgress, [0, 1], [startY, groundY]);
        } else {
          charY = groundY;
        }

        const charOpacity = interpolate(frame, [charStartFrame, charStartFrame + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Bubble appears after character lands (around frame 60+)
        const bubbleStartFrame = charStartFrame + fallDuration + 20;
        const bubbleProgress = interpolate(frame, [bubbleStartFrame, bubbleStartFrame + 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        // Bubble floats up slightly
        const bubbleFloat = Math.sin((frame - bubbleStartFrame) * 0.1) * 3;

        return (
          <div
            key={char.id}
            style={{
              position: "absolute",
              left: startX + index * spacing,
              top: charY,
              transform: "translateX(-50%)",
              opacity: charOpacity,
            }}
          >
            {/* Glow behind character */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: `${char.frameW * char.scale}px`,
                height: `${char.frameH * char.scale}px`,
                background: `radial-gradient(circle, ${COLORS.glowGreen} 0%, transparent 70%)`,
                opacity: 0.3,
                filter: "blur(15px)",
              }}
            />

            {/* Character sprite - single frame only (first frame) */}
            <div
              style={{
                width: `${char.frameW * char.scale}px`,
                height: `${char.frameH * char.scale}px`,
                backgroundImage: `url(${char.sprite})`,
                backgroundSize: `${char.spriteW * char.scale}px ${char.spriteH * char.scale}px`,
                backgroundPosition: "0 0",
                imageRendering: "pixelated",
              }}
            />

            {/* Thought bubble above character */}
            <div
              style={{
                position: "absolute",
                top: `${-30 - bubbleFloat}px`,
                left: "50%",
                transform: "translateX(-50%)",
                opacity: bubbleProgress,
                fontSize: "20px",
                pointerEvents: "none",
              }}
            >
              {char.bubble}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Bottom status bar
const StatusBar: React.FC<{ frame: number }> = ({ frame }) => {
  const progress = interpolate(frame, [100, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: "12%",
        left: "50%",
        transform: "translateX(-50%)",
        opacity: progress,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 20, 0, 0.8)",
          border: `1px solid ${COLORS.textGreen}`,
          borderRadius: "4px",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          boxShadow: `0 0 20px ${COLORS.glowGreen}33`,
        }}
      >
        <span style={{ color: COLORS.textGreen, fontSize: "14px" }}>✦ 6 Agents</span>
        <span style={{ color: COLORS.textWhite, opacity: 0.5 }}>|</span>
        <span style={{ color: COLORS.textGreen, fontSize: "14px" }}>🐱 1 Cat</span>
        <span style={{ color: COLORS.textWhite, opacity: 0.5 }}>|</span>
        <span style={{ color: COLORS.textGreen, fontSize: "14px" }}>⚡ Working</span>
      </div>
    </div>
  );
};
