import { useEffect, useRef } from "react";

type WaveformScopeProps = {
  analyser: AnalyserNode | null;
};

export function WaveformScope({ analyser }: WaveformScopeProps) {
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

      context.strokeStyle = "#ffffff";
      context.lineWidth = 2.6;
      context.beginPath();

      if (analyser && data) {
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
      } else {
        for (let index = 0; index < width; index += 1) {
          const phase = index / width;
          const y = mid - Math.sin(phase * Math.PI * 6 + frame * 0.03) * height * 0.34;
          if (index === 0) context.moveTo(index, y);
          else context.lineTo(index, y);
        }
      }

      context.stroke();
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frame);
    };
  }, [analyser]);

  return <canvas ref={canvasRef} className="scope-canvas" aria-label="Waveform visualization" />;
}
