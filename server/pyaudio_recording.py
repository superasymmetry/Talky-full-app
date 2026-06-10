import pyaudio
import numpy as np
import soundfile as sf

def record_audio(filename="./input.wav", record_seconds=5, rate=16000):
    chunk = 1024
    format = pyaudio.paInt16
    channels = 1

    audio = pyaudio.PyAudio()
    print(f"\nRecording for {record_seconds} seconds")

    stream = audio.open(format=format, channels=channels,
                        rate=rate, input=True,
                        frames_per_buffer=chunk)

    frames = []
    for _ in range(0, int(rate / chunk * record_seconds)):
        data = stream.read(chunk)
        frames.append(np.frombuffer(data, dtype=np.int16))

    print("Recording finished.\n")
    stream.stop_stream()
    stream.close()
    audio.terminate()

    waveform = np.concatenate(frames).astype(np.float32) / 32768.0
    sf.write(filename, waveform, rate)
    return filename

if __name__ == "__main__":
    record_audio()