import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  Easing,
  spring,
  useVideoConfig,
} from "remotion";

export const PixelAgentsPromo: React.FC<{
  title: string;
  subtitle: string;
}> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill className="bg-gray-900">
      {/* Background gradient */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        }}
      />

      {/* Grid pattern overlay */}
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      {/* Main content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Logo/Icon sequence */}
        <Sequence from={0} durationInFrames={90}>
          <LogoAnimation />
        </Sequence>

        {/* Title sequence */}
        <Sequence from={60} durationInFrames={180}>
          <TitleAnimation title={title} />
        </Sequence>

        {/* Subtitle sequence */}
        <Sequence from={120} durationInFrames={150}>
          <SubtitleAnimation subtitle={subtitle} />
        </Sequence>

        {/* Feature highlights */}
        <Sequence from={150} durationInFrames={150}>
          <FeatureHighlights />
        </Sequence>

        {/* CTA sequence */}
        <Sequence from={240} durationInFrames={60}>
          <CTAAnimation />
        </Sequence>
      </AbsoluteFill>

      {/* Pixel art characters walking */}
      <Sequence from={30} durationInFrames={240}>
        <CharacterParade />
      </Sequence>

      {/* Sparkle effects */}
      <Sequence from={0} durationInFrames={300}>
        <SparkleEffects />
      </Sequence>
    </AbsoluteFill>
  );
};

const LogoAnimation: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = spring({
    frame,
    fps: 30,
    from: 0,
    to: 1,
    durationInFrames: 60,
    easing: Easing.out(Easing.back(3)),
  });

  const rotate = interpolate(frame, [0, 60], [-180, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "200px",
          height: "200px",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          boxShadow: "0 20px 60px rgba(102, 126, 234, 0.5)",
        }}
      >
        <span
          style={{
            fontSize: "100px",
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))",
          }}
        >
          🤖
        </span>
      </div>
    </AbsoluteFill>
  );
};

const TitleAnimation: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(frame, [0, 30], [100, 0], {
    extrapolateRight: "clamp",
  });

  const scale = spring({
    frame,
    fps: 30,
    from: 0.8,
    to: 1,
    durationInFrames: 45,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "20%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
      }}
    >
      <h1
        style={{
          fontSize: "96px",
          fontWeight: "900",
          background: "linear-gradient(135deg, #fff 0%, #a5b4fc 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textShadow: "0 4px 30px rgba(165, 180, 252, 0.5)",
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        {title}
      </h1>
    </div>
  );
};

const SubtitleAnimation: React.FC<{ subtitle: string }> = ({ subtitle }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(frame, [0, 20], [30, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "35%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <p
        style={{
          fontSize: "32px",
          color: "#94a3b8",
          fontWeight: "400",
          letterSpacing: "0.05em",
          margin: 0,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
};

const FeatureHighlights: React.FC = () => {
  const frame = useCurrentFrame();

  const features = [
    { icon: "🏢", text: "Pixel Art Office" },
    { icon: "🤖", text: "AI Agents" },
    { icon: "⚡", text: "Real-time Terminal" },
    { icon: "🎮", text: "Interactive Environment" },
  ];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        top: "50%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "40px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {features.map((feature, index) => {
          const startFrame = index * 15;
          const featureFrame = frame - startFrame;

          if (featureFrame < 0) return null;

          const opacity = interpolate(featureFrame, [0, 15], [0, 1], {
            extrapolateRight: "clamp",
          });

          const scale = spring({
            frame: featureFrame,
            fps: 30,
            from: 0,
            to: 1,
            durationInFrames: 20,
          });

          return (
            <div
              key={feature.text}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                opacity,
                transform: `scale(${scale})`,
              }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  background: "linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)",
                  borderRadius: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "40px",
                  border: "1px solid rgba(102, 126, 234, 0.3)",
                }}
              >
                {feature.icon}
              </div>
              <span
                style={{
                  color: "#e2e8f0",
                  fontSize: "14px",
                  fontWeight: "500",
                  textAlign: "center",
                }}
              >
                {feature.text}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CTAAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = spring({
    frame,
    fps,
    config: { damping: 0.5, stiffness: 100 },
    from: 1,
    to: 1.05,
    durationInFrames: 30,
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          padding: "20px 60px",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: "50px",
          transform: `scale(${pulse})`,
          boxShadow: "0 20px 60px rgba(102, 126, 234, 0.5)",
        }}
      >
        <span
          style={{
            color: "#fff",
            fontSize: "28px",
            fontWeight: "700",
            whiteSpace: "nowrap",
          }}
        >
          ✨ Available Now
        </span>
      </div>
    </AbsoluteFill>
  );
};

const CharacterParade: React.FC = () => {
  const frame = useCurrentFrame();

  const characters = ["🤖", "👨‍💻", "‍💻", "🤖", "👨‍💻"];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: "100px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "30px",
          alignItems: "flex-end",
        }}
      >
        {characters.map((char, index) => {
          const bounce = Math.sin((frame + index * 10) * 0.1) * 10;

          return (
            <div
              key={index}
              style={{
                fontSize: "60px",
                transform: `translateY(${bounce}px)`,
                filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.3))",
              }}
            >
              {char}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const SparkleEffects: React.FC = () => {
  const frame = useCurrentFrame();
  const [sparkles, setSparkles] = useState<
    Array<{ id: number; x: number; y: number; delay: number }>
  >([]);

  useEffect(() => {
    const newSparkles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 60,
    }));
    setSparkles(newSparkles);
  }, []);

  return (
    <AbsoluteFill>
      {sparkles.map((sparkle) => {
        const sparkleFrame = (frame - sparkle.delay + 300) % 60;

        if (sparkleFrame < 0 || sparkleFrame > 30) return null;

        const opacity = interpolate(sparkleFrame, [0, 15, 30], [0, 1, 0], {
          extrapolateRight: "clamp",
        });

        const scale = interpolate(sparkleFrame, [0, 15, 30], [0, 1.5, 2], {
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={sparkle.id}
            style={{
              position: "absolute",
              left: `${sparkle.x}%`,
              top: `${sparkle.y}%`,
              width: "20px",
              height: "20px",
              background: "radial-gradient(circle, #fff 0%, transparent 70%)",
              borderRadius: "50%",
              opacity,
              transform: `scale(${scale})`,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
