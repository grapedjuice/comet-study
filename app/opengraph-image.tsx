import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/*
 * The link-preview card (Discord, iMessage, Slack, X). Mirrors the landing
 * hero: the midnight aurora, "Same class." in Geist over the gradient serif
 * "Better company.", and the brand comet streaking in from the right.
 * Satori only reads static TTF/OTF/WOFF, so Geist ships as a 500 instance
 * cut from the variable font (assets/fonts, OFL).
 */
export const alt =
  "Comet Study — Same class. Better company. A study companion for UT Dallas students.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const root = process.cwd();
const [geist, serifItalic, mark] = await Promise.all([
  readFile(join(root, "assets/fonts/Geist-Medium.ttf")),
  readFile(
    join(
      root,
      "node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff",
    ),
  ),
  readFile(join(root, "app/icon0.svg"), "base64"),
]);

const HEAD = { x: 1090, y: 132 };
const ANGLE = -24;

const grad = "linear-gradient(100deg, #a99bff 0%, #74c7ff 48%, #6ff0d8 100%)";

// A fixed scatter of stars (seeded, so every build draws the same sky).
const stars = (() => {
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 70 }, () => ({
    x: Math.round(next() * 1200),
    y: Math.round(next() * 630),
    r: next() > 0.85 ? 2.5 : 1.5,
    o: 0.25 + next() * 0.55,
  }));
})();

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: "#04050b",
        backgroundImage: [
          "radial-gradient(ellipse 700px 460px at 16% 4%, rgba(96, 72, 255, 0.62), transparent)",
          "radial-gradient(ellipse 640px 420px at 56% 34%, rgba(46, 84, 220, 0.58), transparent)",
          "radial-gradient(ellipse 600px 400px at 94% 84%, rgba(124, 72, 236, 0.5), transparent)",
          "radial-gradient(ellipse 520px 320px at 4% 100%, rgba(40, 170, 190, 0.32), transparent)",
        ].join(", "),
        color: "#eef0fb",
        fontFamily: "Geist",
      }}
    >
      {stars.map((star, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: star.x,
            top: star.y,
            width: star.r,
            height: star.r,
            borderRadius: 999,
            backgroundColor: "#ffffff",
            opacity: star.o,
          }}
        />
      ))}

      {/* The comet, as in the brand mark: three gradient trails pivoting
            on a glowing head, streaking in from the upper right. */}
      {[
        { dy: 0, w: 370, h: 9, o: 1 },
        { dy: -26, w: 250, h: 5, o: 0.7 },
        { dy: 26, w: 300, h: 5, o: 0.7 },
      ].map((trail, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: HEAD.x - trail.w,
            top: HEAD.y + trail.dy - trail.h / 2,
            width: trail.w,
            height: trail.h,
            borderRadius: 999,
            opacity: trail.o,
            backgroundImage:
              "linear-gradient(90deg, rgba(111, 240, 216, 0) 0%, rgba(116, 199, 255, 0.6) 55%, #a99bff 100%)",
            transform: `rotate(${ANGLE}deg)`,
            transformOrigin: `${trail.w}px ${trail.h / 2 - trail.dy}px`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: HEAD.x - 110,
          top: HEAD.y - 110,
          width: 220,
          height: 220,
          borderRadius: 999,
          backgroundImage:
            "radial-gradient(circle, #ffffff 0%, #ffffff 9%, rgba(217, 211, 255, 0.75) 16%, rgba(139, 123, 255, 0.3) 36%, transparent 68%)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "64px 76px 60px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;base64,${mark}`}
            width={64}
            height={64}
            alt=""
            style={{
              borderRadius: 16,
              boxShadow: "0 8px 30px rgba(139, 123, 255, 0.45)",
            }}
          />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 36, letterSpacing: "-0.02em" }}>
              Comet
            </span>
            <span
              style={{
                fontFamily: "Instrument Serif",
                fontSize: 40,
                color: "#74c7ff",
              }}
            >
              Study
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 58,
          }}
        >
          <span
            style={{
              fontSize: 128,
              lineHeight: 1,
              letterSpacing: "-0.05em",
            }}
          >
            Same class.
          </span>
          <span
            style={{
              fontFamily: "Instrument Serif",
              fontSize: 148,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              marginTop: -4,
              paddingRight: 24,
              backgroundImage: grad,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Better company.
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            fontSize: 26,
            color: "#a6abc6",
          }}
        >
          <span>Find classmates, make a plan, keep showing up.</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px 10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              color: "#eef0fb",
              fontSize: 22,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: "#5eead4",
                boxShadow: "0 0 12px #5eead4",
              }}
            />
            For UT Dallas students
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: geist, weight: 500, style: "normal" },
        {
          name: "Instrument Serif",
          data: serifItalic,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
