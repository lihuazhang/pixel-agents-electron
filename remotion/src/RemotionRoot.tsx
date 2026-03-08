import { Composition } from "remotion";
import { PixelAgentsPromo } from "./components/PixelAgentsPromo";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="PixelAgentsPromo"
        component={PixelAgentsPromo}
        durationInFrames={300} // 10 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Pixel Agents",
          subtitle: "Watch Claude Code agents come to life",
        }}
      />
    </>
  );
};
