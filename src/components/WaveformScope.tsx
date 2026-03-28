import { useEffect, useRef } from "react";
import type { OscillatorPatch } from "../types/synth";

type WaveformScopeProps = {
  analyser: AnalyserNode | null;
  oscillators: OscillatorPatch[];
};

const OSC_COLORS = ["#f2b7c7", "#9ec5ff", "#f5de87"];

export function WaveformScope({ analyser, oscillators }: WaveformScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let data = analyser ? new Uint8Array(analyser.fftSize) : null;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const mid = height / 2;

      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(255, 255, 255, 0.06)";
      context.lineWidth = 1;

      for (let row = 0; row <= 5; row += 1) {
        const y = (height / 5) * row;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      for (let column = 0; column <= 12; column += 1) {
        const x = (width / 12) * column;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      if (analyser && data) {
        const activeColors = oscillators
          .map((oscillator, index) => (oscillator.enabled && !oscillator.lfoMode ? OSC_COLORS[index] : null))
          .filter((color): color is string => color !== null);

        const stroke = activeColors.length <= 1
          ? activeColors[0] ?? "#ffffff"
          : (() => {
              const gradient = context.createLinearGradient(0, 0, width, 0);
              activeColors.forEach((color, index) => {
                gradient.addColorStop(index / Math.max(activeColors.length - 1, 1), color);
              });
              return gradient;
            })();

        context.strokeStyle = stroke;
        context.lineWidth = 2.6;
        context.beginPath();

        analyser.getByteTimeDomainData(data);
        let start = 0;
        for (let index = 1; index < data.length; index += 1) {
          if (data[index - 1] < 128 && data[index] >= 128) {
            start = index;
            break;
          }
        }

        const span = Math.min(512, data.length - start);
        for (let index = 0; index < span; index += 1) {
          const sample = (data[start + index] - 128) / 128;
          const x = (index / Math.max(span - 1, 1)) * width;
          const y = mid - sample * height * 0.42;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.save();
        context.lineTo(width, height - 12);
        context.lineTo(0, height - 12);
        context.closePath();
        const fill = context.createLinearGradient(0, mid - height * 0.26, 0, height);
        if (typeof stroke === "string") {
          fill.addColorStop(0, `${stroke}33`);
        } else {
          fill.addColorStop(0, "rgba(255,255,255,0.18)");
        }
        fill.addColorStop(1, "rgba(255,255,255,0.01)");
        context.fillStyle = fill;
        context.fill();
        context.restore();

        context.shadowBlur = 16;
        context.shadowColor = typeof stroke === "string" ? stroke : "rgba(255,255,255,0.38)";
        context.beginPath();
        for (let index = 0; index < span; index += 1) {
          const sample = (data[start + index] - 128) / 128;
          const x = (index / Math.max(span - 1, 1)) * width;
          const y = mid - sample * height * 0.42;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
        context.shadowBlur = 0;
      } else {
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2.6;
        context.beginPath();
        for (let index = 0; index < width; index += 1) {
          const phase = index / width;
          const y = mid - Math.sin(phase * Math.PI * 6 + frame * 0.03) * height * 0.34;
          if (index === 0) context.moveTo(index, y);
          else context.lineTo(index, y);
        }

        context.stroke();
      }
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frame);
    };
  }, [analyser, oscillators]);

  return <canvas ref={canvasRef} className="scope-canvas" aria-label="Waveform visualization" />;
}
