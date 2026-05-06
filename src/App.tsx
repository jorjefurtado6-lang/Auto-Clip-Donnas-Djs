import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Play, Square, Download, Film, Music, Settings, Scissors, Video, Trash2, Camera, StopCircle, Type, Cloud, X, Loader2 } from 'lucide-react';

interface VideoSource {
  id: string;
  file: File;
  url: string;
  element: HTMLVideoElement | null;
  playbackRate?: number;
}

interface AudioSourceType {
  id: string;
  file: File;
  url: string;
  element: HTMLAudioElement | null;
}

interface OverlayItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  entrance: string;
}

export default function App() {
  const [videos, setVideos] = useState<VideoSource[]>([]);
  const [audios, setAudios] = useState<AudioSourceType[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4'>('webm');
  const [recordedFormat, setRecordedFormat] = useState<'webm' | 'mp4'>('webm');

  // Transitions
  const [transitionEffect, setTransitionEffect] = useState('cut');
  const [videoSequence, setVideoSequence] = useState<'random' | 'sequential'>('random');

  // Settings
  const [sensitivity, setSensitivity] = useState(200); // 0-255 threshold for bass
  const [cooldown, setCooldown] = useState(500); // ms minimum between cuts
  const [editingStyle, setEditingStyle] = useState('custom');

  // Text Overlay
  const [overlays, setOverlays] = useState<OverlayItem[]>([
    { id: '1', text: '', startTime: 0, endTime: 5, entrance: 'none' }
  ]);
  const [activeOverlayIdx, setActiveOverlayIdx] = useState(0);

  const [previewTime, setPreviewTime] = useState(0);

  // Google Drive State
  const [googleDriveToken, setGoogleDriveToken] = useState<string | null>(null);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [exportingToDrive, setExportingToDrive] = useState(false);

  // Google Drive Logic
  const connectGoogleDrive = async () => {
    try {
      const redirectUri = window.location.origin + '/auth/google/callback';
      const res = await fetch(`/api/auth/google/url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      
      if (data.error) {
        alert("Erro: " + data.error);
        return;
      }
      
      const popup = window.open(data.url, 'google_drive_auth', 'width=600,height=700');
      if (!popup) {
        alert("Por favor libere os popups para autenticar no Google Drive.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao conectar com Google Drive.");
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setGoogleDriveToken(event.data.token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchDriveFiles = async () => {
    if (!googleDriveToken) return;
    setDriveLoading(true);
    setDriveFiles([]);
    try {
      const query = "mimeType contains 'video/' or mimeType contains 'audio/'";
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,thumbnailLink,size)&pageSize=100`, {
        headers: { Authorization: `Bearer ${googleDriveToken}` }
      });
      const data = await res.json();
      if (data.files) setDriveFiles(data.files);
    } catch (e) {
      console.error(e);
    }
    setDriveLoading(false);
  };

  const handleDriveFileSelect = async (file: any) => {
    if (!googleDriveToken) return;
    setDriveLoading(true);
    try {
       const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
         headers: { Authorization: `Bearer ${googleDriveToken}` }
       });
       const blob = await res.blob();
       const downloadedFile = new File([blob], file.name, { type: file.mimeType });
       
       if (file.mimeType.startsWith('video/')) {
          const newVideo = {
            id: Math.random().toString(36).substring(7),
            file: downloadedFile,
            url: URL.createObjectURL(downloadedFile),
            element: null,
            playbackRate: 1
          };
          setVideos(prev => [...prev, newVideo]);
       } else if (file.mimeType.startsWith('audio/')) {
          const newAudio = {
            id: Math.random().toString(36).substring(7),
            file: downloadedFile,
            url: URL.createObjectURL(downloadedFile),
            element: null
          };
          setAudios(prev => [...prev, newAudio]);
       }
       setShowDriveModal(false);
    } catch (e) {
       console.error(e);
       alert("Erro ao baixar arquivo do Drive");
    }
    setDriveLoading(false);
  };

  const handleExportToDrive = async () => {
    if (!googleDriveToken || recordedChunks.length === 0) {
      if (!googleDriveToken) connectGoogleDrive();
      return;
    }
    
    setExportingToDrive(true);
    try {
      const blob = new Blob(recordedChunks, { type: `video/${recordedFormat}` });
      const metadata = {
         name: `AutoClipMV_Export_${new Date().getTime()}.${recordedFormat}`,
         mimeType: blob.type
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleDriveToken}`
        },
        body: form
      });
      const data = await res.json();
      if (data.id) {
         alert("Exportado para o Google Drive com sucesso!");
      } else {
         console.warn(data);
         alert("Falha ao exportar.");
      }
    } catch(e) {
       console.error(e);
       alert("Erro de exportação");
    }
    setExportingToDrive(false);
  };

  const totalAudioDuration = audios.reduce((acc, a) => acc + (a.element?.duration || 0), 0) || 0;

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStyleChange = (style: string) => {
    setEditingStyle(style);
    if (style === 'cinematic') {
      setSensitivity(200);
      setCooldown(1500);
    } else if (style === 'fast') {
      setSensitivity(140);
      setCooldown(200);
    } else if (style === 'minimalist') {
      setSensitivity(230);
      setCooldown(3000);
    }
  };

  // Refs for real-time processing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  
  const activeVideoIndexRef = useRef<number>(0);
  const activeAudioIndexRef = useRef<number>(0);
  const lastCutTimeRef = useRef<number>(0);
  const sensitivityRef = useRef(sensitivity);
  const cooldownRef = useRef(cooldown);
  const overlaysRef = useRef(overlays);
  const prevVideoIndexRef = useRef<number>(-1);
  const transitionStartTimeRef = useRef<number>(0);
  const transitionEffectRef = useRef(transitionEffect);
  const videoSequenceRef = useRef(videoSequence);
  const videoQueueRef = useRef<number[]>([]);

  // Update refs when state changes so animation loop has fresh values
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { cooldownRef.current = cooldown; }, [cooldown]);
  useEffect(() => { 
     overlaysRef.current = overlays; 
     if (!isPlaying && !isRecording && videos.length > 0) {
       // Render updated overlay text on canvas if it's visible at previewTime
       requestAnimationFrame(() => drawFrame(previewTime));
     }
  }, [overlays, isPlaying, isRecording, previewTime, videos.length]);
  useEffect(() => { transitionEffectRef.current = transitionEffect; }, [transitionEffect]);
  useEffect(() => { videoSequenceRef.current = videoSequence; videoQueueRef.current = []; }, [videoSequence]);
  useEffect(() => { videoQueueRef.current = []; }, [videos.length]);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newVideos = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substring(7),
        file,
        url: URL.createObjectURL(file),
        element: null,
        playbackRate: 1
      }));
      setVideos(prev => [...prev, ...newVideos]);
    }
  };

  const removeVideo = (id: string) => {
    setVideos(prev => {
      const filtered = prev.filter(v => v.id !== id);
      const toRemove = prev.find(v => v.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.url);
      return filtered;
    });
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAudios = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substring(7),
        file,
        url: URL.createObjectURL(file),
        element: null
      }));
      setAudios(prev => [...prev, ...newAudios]);
    }
  };

  const removeAudio = (id: string) => {
    setAudios(prev => {
      const filtered = prev.filter(a => a.id !== id);
      const toRemove = prev.find(a => a.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.url);
      return filtered;
    });
  };

  // Setup media elements when they are added to state
  const handleAudioRef = useCallback((el: HTMLAudioElement | null, id: string) => {
    setAudios(prev => {
      const audio = prev.find(a => a.id === id);
      if (audio) audio.element = el;
      return prev;
    });
  }, []);

  const handleVideoRef = useCallback((el: HTMLVideoElement | null, id: string) => {
    setVideos(prev => {
      const video = prev.find(v => v.id === id);
      if (video) video.element = el; // Mutate directly to save reference without triggering re-render
      return prev;
    });
  }, []);

  const cutToNextVideo = () => {
    if (videos.length <= 1) return;
    
    let nextIndex;
    
    if (videos.length > 2) {
      if (videoSequenceRef.current === 'sequential') {
         nextIndex = (activeVideoIndexRef.current + 1) % videos.length;
      } else {
        if (videoQueueRef.current.length === 0) {
          // Refill queue with all indices
          const indices = Array.from({ length: videos.length }, (_, i) => i);
          
          // Remove current active video index so it doesn't repeat immediately if it happens to be first
          const currentActiveInfo = indices.indexOf(activeVideoIndexRef.current);
          if (currentActiveInfo !== -1) {
              indices.splice(currentActiveInfo, 1);
          }

          // Shuffle
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
          }
          
          // Add the current active index somewhere not at the beginning (e.g. at the end) 
          // to ensure it gets played in this new round without repeating immediately
          if (currentActiveInfo !== -1) {
              indices.push(activeVideoIndexRef.current);
          }

          videoQueueRef.current = indices;
        }
        
        nextIndex = videoQueueRef.current.shift()!;
      }
    } else {
      // Just toggle between the two available videos
      nextIndex = activeVideoIndexRef.current === 0 ? 1 : 0;
    }
    
    // Pause current or set transition state
    const currentVideo = videos[activeVideoIndexRef.current]?.element;
    if (transitionEffectRef.current === 'cut') {
      if (currentVideo) currentVideo.pause();
    } else {
      if (currentVideo) currentVideo.pause();
    }

    prevVideoIndexRef.current = activeVideoIndexRef.current;
    transitionStartTimeRef.current = performance.now();
    activeVideoIndexRef.current = nextIndex;
    
    // Start next (ensure it plays and seek to a random position for variety)
    const nextVideo = videos[nextIndex]?.element;
    if (nextVideo) {
       if (nextVideo.duration && isFinite(nextVideo.duration) && nextVideo.duration > 0) {
         // keep it within safe bounds, start anywhere between 0 and 90% of the video
         try {
           nextVideo.currentTime = Math.random() * (nextVideo.duration * 0.9);
         } catch (e) {
           console.warn("Failed to set currentTime on video", e);
         }
       }
       nextVideo.playbackRate = videos[nextIndex].playbackRate || 1;
       nextVideo.play().catch(console.error);
    }
  };

  const drawFrame = (overrideTime?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (videos.length > 0) {
      const activeVideo = videos[activeVideoIndexRef.current]?.element;
      const prevVideo = prevVideoIndexRef.current !== -1 ? videos[prevVideoIndexRef.current]?.element : null;
      
      const now = performance.now();
      const tEffect = transitionEffectRef.current;
      
      if (activeVideo && activeVideo.readyState < 2) {
         // Pause the transition clock while loading
         transitionStartTimeRef.current = now;
      }
      
      const transitionDur = 600; // ms
      const elapsed = overrideTime !== undefined ? transitionDur : now - transitionStartTimeRef.current;

      const drawVideo = (videoElem: HTMLVideoElement | null | undefined, alpha: number = 1) => {
        if (!videoElem || videoElem.readyState < 2) return;
        const canvasAspect = canvas.width / canvas.height;
        const videoAspect = videoElem.videoWidth / videoElem.videoHeight;
        
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;

        if (canvasAspect > videoAspect) {
          drawWidth = canvas.width;
          drawHeight = canvas.width / videoAspect;
          offsetY = (canvas.height - drawHeight) / 2;
        } else {
          drawHeight = canvas.height;
          drawWidth = canvas.height * videoAspect;
          offsetX = (canvas.width - drawWidth) / 2;
        }
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(videoElem, offsetX, offsetY, drawWidth, drawHeight);
        ctx.restore();
      };

      // Draw black background first
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (tEffect !== 'cut' && elapsed < transitionDur && prevVideo) {
          const progress = elapsed / transitionDur;
          
          if (tEffect === 'fade') {
             drawVideo(prevVideo, 1);
             drawVideo(activeVideo, progress);
          } else if (tEffect === 'flash') {
             if (progress < 0.5) {
                 drawVideo(prevVideo, 1);
                 ctx.save();
                 ctx.globalAlpha = progress * 2;
                 ctx.fillStyle = 'white';
                 ctx.fillRect(0, 0, canvas.width, canvas.height);
                 ctx.restore();
             } else {
                 drawVideo(activeVideo, 1);
                 ctx.save();
                 ctx.globalAlpha = 1 - (progress - 0.5) * 2;
                 ctx.fillStyle = 'white';
                 ctx.fillRect(0, 0, canvas.width, canvas.height);
                 ctx.restore();
             }
          } else if (tEffect === 'black') {
             if (progress < 0.5) {
                 const p = Math.min(1, progress * 2);
                 drawVideo(prevVideo, 1 - p);
             } else {
                 const p = Math.min(1, (progress - 0.5) * 2);
                 drawVideo(activeVideo, p);
             }
          }
      } else {
          drawVideo(activeVideo, 1);
      }
    } else {
      // blank screen
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Overlay Text with Animation
    let currentTime = 0;
    if (overrideTime !== undefined) {
      currentTime = overrideTime;
    } else {
      let globalTime = 0;
      for (let i = 0; i < activeAudioIndexRef.current; i++) {
          globalTime += audios[i]?.element?.duration || 0;
      }
      const currentAudioElem = audios[activeAudioIndexRef.current]?.element;
      if (currentAudioElem) {
        currentTime = globalTime + currentAudioElem.currentTime;
      }
    }
    
    if (currentTime > 0 || overrideTime !== undefined) {
      overlaysRef.current.forEach(overlay => {
        if (!overlay.text.trim()) return;
        const start = overlay.startTime;
        const end = overlay.endTime;
        
        if (currentTime >= start && currentTime <= end) {
           let opacity = 1;
           let scale = 1;
           let yOffset = 0;
           let textToDraw = overlay.text;
           
           const elapsed = Math.max(0, currentTime - start);
           const duration = Math.max(0, end - start);
           const animDur = 0.5; // 0.5 seconds for entrance/exit animations
           
           const entrance = overlay.entrance;
           
           // Entrance Animation
           if (entrance === 'fade' && elapsed < animDur) {
             opacity = elapsed / animDur;
           } else if (entrance === 'scale' && elapsed < animDur) {
             scale = 0.5 + (0.5 * (elapsed / animDur));
             opacity = elapsed / animDur;
           } else if (entrance === 'slideUp' && elapsed < animDur) {
             yOffset = 50 * (1 - (elapsed / animDur));
             opacity = elapsed / animDur;
           } else if (entrance === 'slideDown' && elapsed < animDur) {
             yOffset = -50 * (1 - (elapsed / animDur));
             opacity = elapsed / animDur;
           } else if (entrance === 'typewriter') {
             const maxChars = Math.floor((elapsed / animDur) * textToDraw.length);
             textToDraw = textToDraw.substring(0, Math.min(textToDraw.length, Math.max(1, maxChars)));
           }
           
           // Exit Animation (fade out for all)
           if (duration - elapsed < animDur) {
             opacity = (duration - elapsed) / animDur;
           }

           ctx.save();
           ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
           ctx.fillStyle = 'white';
           ctx.font = '800 64px Inter, system-ui, sans-serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
           ctx.shadowBlur = 20;
           
           const x = canvas.width / 2;
           const y = canvas.height / 2 + yOffset;

           if (scale !== 1) {
             ctx.translate(x, y);
             ctx.scale(scale, scale);
             ctx.fillText(textToDraw, 0, 0);
           } else {
             ctx.fillText(textToDraw, x, y);
           }
           ctx.restore();
        }
      });
    }
  };

  const processAudioAndRender = useCallback(() => {
    if (!analyserRef.current || !isPlaying) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Focus on lower frequencies (bass/kick drum) for beats
    let sum = 0;
    const bassRange = Math.floor(dataArray.length * 0.1); 
    for (let i = 0; i < bassRange; i++) {
      sum += dataArray[i];
    }
    const averageBass = sum / bassRange;

    const now = performance.now();
    
    // Check if we hit a beat spike and are past the cooldown period
    const isBeat = averageBass > sensitivityRef.current;
    const timeSinceLastCut = now - lastCutTimeRef.current;
    
    // Force a cut if no beat was detected for a long time (fallback)
    const maxTimeOnScene = 4000; // 4 seconds fallback
    
    if ((isBeat && timeSinceLastCut > cooldownRef.current) || timeSinceLastCut > maxTimeOnScene) {
      cutToNextVideo();
      lastCutTimeRef.current = now;
    }

    drawFrame();
    
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(processAudioAndRender);
    }
  }, [isPlaying, videos]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(processAudioAndRender);
    } else {
      cancelAnimationFrame(animationRef.current);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, processAudioAndRender]);

  const setupAudioConnections = () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(audioContextRef.current.destination);
    }
    
    audios.forEach((audioItem) => {
      if (audioItem.element && !audioSourceNodesRef.current.has(audioItem.id)) {
        try {
          const source = audioContextRef.current!.createMediaElementSource(audioItem.element);
          source.connect(analyserRef.current!);
          audioSourceNodesRef.current.set(audioItem.id, source);
        } catch (e) {
          console.warn('Could not create MediaElementSource for audio', audioItem.id, e);
        }
      }
    });
  };

  const togglePlayback = async () => {
    if (audios.length === 0 || videos.length === 0) {
      alert("Por favor, adicione pelo menos um vídeo e um áudio antes de começar.");
      return;
    }

    if (isPlaying) {
      // Stop
      setIsPlaying(false);
      audios.forEach(a => a.element?.pause());
      const currentVideo = videos[activeVideoIndexRef.current]?.element;
      if (currentVideo) currentVideo.pause();
    } else {
      // Start
      setupAudioConnections();

      if (audioContextRef.current!.state === 'suspended') {
        await audioContextRef.current!.resume();
      }

      const activeAudio = audios[activeAudioIndexRef.current]?.element;
      if (activeAudio) {
        activeAudio.play().catch(console.error);
      } else {
        activeAudioIndexRef.current = 0;
        audios[0]?.element?.play().catch(console.error);
      }
      
      const currentVideo = videos[activeVideoIndexRef.current]?.element;
      if (currentVideo) {
        currentVideo.muted = true; // explicitly mute videos to ensure browser allows playing
        currentVideo.playbackRate = videos[activeVideoIndexRef.current].playbackRate || 1;
        currentVideo.play().catch(e => console.error("Video play failed:", e));
      }
      
      lastCutTimeRef.current = performance.now();
      transitionStartTimeRef.current = performance.now();
      
      setIsPlaying(true);
    }
  };

  const startRecording = async () => {
    if (!canvasRef.current || videos.length === 0 || audios.length === 0) return;
    
    setupAudioConnections();

    if (audioContextRef.current!.state === 'suspended') {
      await audioContextRef.current!.resume();
    }

    setRecordedChunks([]);
    setRecordedVideoUrl(null);
    
    // Capture canvas stream (30 fps)
    const canvasStream = canvasRef.current.captureStream(30);
    
    let audioStream: MediaStream | null = null;
    
    // Use Web Audio API destination node for clean mixed capture
    if (audioContextRef.current && analyserRef.current) {
       if (!audioDestRef.current) {
         audioDestRef.current = audioContextRef.current.createMediaStreamDestination();
         analyserRef.current.connect(audioDestRef.current);
       }
       audioStream = audioDestRef.current.stream;
    }
    
    const combinedTracks = [
      ...canvasStream.getVideoTracks()
    ];
    
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      combinedTracks.push(...audioStream.getAudioTracks());
    }
    
    const combinedStream = new MediaStream(combinedTracks);
    streamRef.current = combinedStream; // Prevent garbage collection
    
    let finalMimeType = 'video/webm; codecs=vp9,opus';
    let actualFormat: 'webm' | 'mp4' = 'webm';
       
    if (exportFormat === 'mp4') {
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        finalMimeType = 'video/mp4';
        actualFormat = 'mp4';
      } else {
        alert("Seu navegador não suporta gravação direta em MP4 (use navegadores como Safari, ou grave em WebM e converta depois).");
        finalMimeType = 'video/webm; codecs=vp9,opus';
        setExportFormat('webm');
        actualFormat = 'webm';
      }
    }
    
    setRecordedFormat(actualFormat);
    
    try {
      const options = { mimeType: finalMimeType };
      mediaRecorderRef.current = new MediaRecorder(combinedStream, options);
    } catch (e) {
      console.warn('Preferred codec not supported, falling back to default');
      mediaRecorderRef.current = new MediaRecorder(combinedStream, { mimeType: `video/${actualFormat}` });
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };

    mediaRecorderRef.current.start();
    setIsRecording(true);
    
    // Start playback automatically
    audios.forEach(a => {
      if (a.element) {
        a.element.pause();
        a.element.currentTime = 0; // Rewind
      }
    });

    activeAudioIndexRef.current = 0;
    const firstAudio = audios[0]?.element;
    if (firstAudio) {
      firstAudio.play().catch(console.error);
    }

    const currentVideo = videos[activeVideoIndexRef.current]?.element;
    if (currentVideo) {
      currentVideo.muted = true;
      currentVideo.playbackRate = videos[activeVideoIndexRef.current].playbackRate || 1;
      currentVideo.play().catch(console.error);
    }
    
    lastCutTimeRef.current = performance.now();
    transitionStartTimeRef.current = performance.now();
    
    setIsPlaying(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Also stop playback
      setIsPlaying(false);
      audios.forEach(a => a.element?.pause());
      const currentVideo = videos[activeVideoIndexRef.current]?.element;
      if (currentVideo) currentVideo.pause();
    }
  };

  // When chunks are finalized, create URL for download
  useEffect(() => {
    if (!isRecording && recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: `video/${recordedFormat}` });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
    }
  }, [isRecording, recordedChunks, recordedFormat]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans selection:bg-purple-500/30 relative overflow-x-hidden">
      
      {/* Background Mesh Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/30 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      
      {/* Hidden elements for processing */}
      <div className="hidden">
        {audios.map((a, index) => (
          <audio
            key={a.id}
            ref={(el) => handleAudioRef(el, a.id)}
            src={a.url}
            crossOrigin="anonymous"
            onEnded={() => {
              // Master track logic (sequencing audios)
              if (index === activeAudioIndexRef.current) {
                 const nextIndex = index + 1;
                 if (nextIndex < audios.length) {
                    activeAudioIndexRef.current = nextIndex;
                    audios[nextIndex].element?.play().catch(console.error);
                 } else {
                    setIsPlaying(false);
                    if (isRecording) stopRecording();
                 }
              }
            }}
          />
        ))}
      </div>
      <div className="hidden">
        {videos.map((v) => (
          <video
            key={v.id}
            ref={(el) => handleVideoRef(el, v.id)}
            src={v.url}
            muted
            loop
            playsInline
            crossOrigin="anonymous"
          />
        ))}
      </div>

      <header className="h-16 flex items-center justify-between px-4 sm:px-8 bg-white/5 backdrop-blur-md border-b border-white/10 z-10 sticky top-0">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-tr from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">AutoClip <span className="text-purple-400">MV</span></h1>
          </div>
          <div className="text-sm font-medium text-gray-300">
            Edição Automática guiada por Áudio
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Media & Settings */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Audio Upload */}
            <section className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Music className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold">Trilhas Sonoras (Mixagem)</h2>
                <span className="ml-auto text-xs font-bold bg-white/10 px-2 py-1 rounded-full text-gray-300">
                  {audios.length}
                </span>
              </div>
              
              <div className="flex gap-2 mb-4">
                <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed border-white/20 hover:border-purple-500 rounded-xl cursor-pointer bg-white/5 hover:bg-white/10 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <p className="text-sm text-gray-400">Adicionar áudios (.mp3)</p>
                  </div>
                  <input type="file" accept="audio/*" multiple onChange={handleAudioUpload} className="hidden" />
                </label>
                <button 
                  onClick={() => { if (!googleDriveToken) connectGoogleDrive(); setShowDriveModal(true);  if (googleDriveToken) fetchDriveFiles(); }}
                  className="flex-shrink-0 w-24 h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#4285F4]/30 hover:border-[#4285F4] rounded-xl cursor-pointer bg-[#4285F4]/5 hover:bg-[#4285F4]/10 transition-colors text-[#4285F4]"
                >
                  <Cloud className="w-6 h-6" />
                  <span className="text-[10px] uppercase font-bold text-center">Drive</span>
                </button>
              </div>

              {audios.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {audios.map((audio) => (
                    <div key={audio.id} className="p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Music className="w-4 h-4 text-purple-400" />
                        </div>
                        <p className="text-xs font-bold truncate text-white">{audio.file.name}</p>
                      </div>
                      <button 
                        onClick={() => removeAudio(audio.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                        title="Remover áudio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Video Upload */}
            <section className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Film className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold">Clipes de Vídeo</h2>
                <span className="ml-auto text-xs font-bold bg-white/10 px-2 py-1 rounded-full text-gray-300">
                  {videos.length}
                </span>
              </div>
              
              <div className="flex gap-2 mb-4">
                <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed border-white/20 hover:border-purple-500 rounded-xl cursor-pointer bg-white/5 hover:bg-white/10 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <p className="text-sm text-gray-400">Adicionar vídeos (.mp4)</p>
                  </div>
                  <input type="file" accept="video/*" multiple onChange={handleVideoUpload} className="hidden" />
                </label>
                <button 
                  onClick={() => { if (!googleDriveToken) connectGoogleDrive(); setShowDriveModal(true);  if (googleDriveToken) fetchDriveFiles(); }}
                  className="flex-shrink-0 w-24 h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#4285F4]/30 hover:border-[#4285F4] rounded-xl cursor-pointer bg-[#4285F4]/5 hover:bg-[#4285F4]/10 transition-colors text-[#4285F4]"
                >
                  <Cloud className="w-6 h-6" />
                  <span className="text-[10px] uppercase font-bold text-center">Drive</span>
                </button>
              </div>

              {videos.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {videos.map((video) => (
                    <div key={video.id} className="p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Video className="w-4 h-4 text-purple-400" />
                        </div>
                        <p className="text-xs font-bold truncate text-white">{video.file.name}</p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <select
                          className="bg-black/50 text-[10px] border border-white/20 rounded px-1 py-0.5 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity outline-none"
                          value={video.playbackRate || 1}
                          onChange={(e) => {
                             const rate = Number(e.target.value);
                             setVideos(prev => prev.map(v => v.id === video.id ? { ...v, playbackRate: rate } : v));
                             if (video.element) {
                               video.element.playbackRate = rate;
                             }
                          }}
                          title="Velocidade de reprodução"
                        >
                          <option value={0.5}>0.5x</option>
                          <option value={0.75}>0.75x</option>
                          <option value={1}>1x</option>
                          <option value={1.25}>1.25x</option>
                          <option value={1.5}>1.5x</option>
                          <option value={2}>2x</option>
                        </select>
                        <button 
                          onClick={() => removeVideo(video.id)}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                          title="Remover vídeo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Settings */}
            <section className="bg-gradient-to-br from-purple-600/20 to-indigo-700/20 backdrop-blur-lg border border-white/10 rounded-2xl p-6 relative z-10 shadow-xl shadow-purple-900/20">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-bold">Ajustes da IA</h2>
              </div>
              
              <div className="mb-6 space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Estilo de Edição</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => handleStyleChange('cinematic')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editingStyle === 'cinematic' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Cinematic</button>
                  <button 
                    onClick={() => handleStyleChange('fast')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editingStyle === 'fast' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Rápido</button>
                  <button 
                    onClick={() => handleStyleChange('minimalist')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editingStyle === 'minimalist' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Minimalista</button>
                  <button 
                    onClick={() => handleStyleChange('custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editingStyle === 'custom' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Personalizado</button>
                </div>

                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mt-4">Transição (Efeito)</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setTransitionEffect('cut')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${transitionEffect === 'cut' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Corte Seco</button>
                  <button 
                    onClick={() => setTransitionEffect('fade')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${transitionEffect === 'fade' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Crossfade</button>
                  <button 
                    onClick={() => setTransitionEffect('black')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${transitionEffect === 'black' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Fade To Black</button>
                  <button 
                    onClick={() => setTransitionEffect('flash')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${transitionEffect === 'flash' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Flash Branco</button>
                </div>

                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mt-4">Sequência (Cenas)</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setVideoSequence('random')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${videoSequence === 'random' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Aleatória (Shuffle)</button>
                  <button 
                    onClick={() => setVideoSequence('sequential')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${videoSequence === 'sequential' ? 'bg-purple-600/30 border-purple-500 text-purple-300' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                  >Sequencial</button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <label className="text-gray-300 font-medium">Sensibilidade da Batida</label>
                    <span className="text-gray-500 font-mono text-xs">{Math.round((sensitivity/255)*100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="50" max="250" 
                    value={sensitivity} 
                    onChange={(e) => {
                      setSensitivity(Number(e.target.value));
                      setEditingStyle('custom');
                    }}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <p className="text-xs text-gray-500">Ajuste para captar batidas mais fortes ou mais suaves.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <label className="text-gray-300 font-medium">Intervalo Mínimo (Cooldown)</label>
                    <span className="text-gray-500 font-mono text-xs">{cooldown}ms</span>
                  </div>
                  <input 
                    type="range" 
                    min="100" max="4000" step="100"
                    value={cooldown} 
                    onChange={(e) => {
                      setCooldown(Number(e.target.value));
                      setEditingStyle('custom');
                    }}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <p className="text-xs text-gray-500">Tempo mínimo de tela para cada clipe antes do próximo corte.</p>
                </div>
              </div>
            </section>

            {/* Text Overlay */}
            <section className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 shadow-xl relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Type className="w-5 h-5 text-pink-400" />
                  <h2 className="text-lg font-bold">Mensagens Sobrepostas</h2>
                </div>
                {overlays.length > 0 && overlays.length <= 5 && (
                  <span className="text-xs font-bold bg-white/10 px-2 py-1 rounded-full text-gray-300">
                    {overlays.length}/5
                  </span>
                )}
              </div>

              <div className="flex gap-2 mb-4 overflow-x-auto custom-scrollbar pb-2">
                {overlays.map((ov, idx) => (
                  <button 
                    key={ov.id}
                    onClick={() => setActiveOverlayIdx(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${activeOverlayIdx === idx ? 'bg-pink-600 border-pink-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                  >
                    Msg {idx + 1}
                  </button>
                ))}
                {overlays.length < 5 && (
                  <button 
                    onClick={() => {
                      setOverlays(prev => [...prev, { id: Math.random().toString(), text: '', startTime: 0, endTime: 5, entrance: 'none' }]);
                      setActiveOverlayIdx(overlays.length);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 flex items-center"
                  >
                     + Add
                  </button>
                )}
              </div>
              
              {overlays.length > 0 && overlays[activeOverlayIdx] && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                     <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Texto da Mensagem {activeOverlayIdx + 1}</label>
                     {overlays.length > 1 && (
                       <button 
                         onClick={() => {
                           setOverlays(prev => prev.filter((_, i) => i !== activeOverlayIdx));
                           setActiveOverlayIdx(Math.max(0, activeOverlayIdx - 1));
                         }}
                         className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase"
                       >
                         Remover
                       </button>
                     )}
                  </div>
                  <input 
                    type="text" 
                    placeholder="Ex: Assista até o final!"
                    value={overlays[activeOverlayIdx].text}
                    onChange={(e) => {
                      const newText = e.target.value;
                      setOverlays(prev => prev.map((o, i) => i === activeOverlayIdx ? { ...o, text: newText } : o));
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-pink-500 transition-colors"
                  />

                  <div>
                     <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Animação de Entrada</label>
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                       {['none', 'fade', 'scale', 'slideUp', 'typewriter'].map(anim => {
                          const labels: Record<string, string> = { none: 'Corte Seco', fade: 'Surgir (Fade)', scale: 'Aumentar', slideUp: 'Deslizar Cima', typewriter: 'Máquina' };
                          const currentAnim = overlays[activeOverlayIdx].entrance;
                          return (
                           <button 
                             key={anim}
                             onClick={() => setOverlays(prev => prev.map((o, i) => i === activeOverlayIdx ? { ...o, entrance: anim } : o))} 
                             className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${currentAnim === anim ? 'bg-pink-500/20 border-pink-500 text-pink-300' : 'bg-black/50 border-white/10 text-gray-400 hover:bg-white/5'}`}
                           >
                              {labels[anim]}
                           </button>
                          );
                       })}
                     </div>
                  </div>
                  
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Início (seg)</label>
                        <input 
                          type="number" 
                          min="0"
                          value={overlays[activeOverlayIdx].startTime}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setOverlays(prev => prev.map((o, i) => i === activeOverlayIdx ? { ...o, startTime: val } : o));
                            setPreviewTime(val);
                          }}
                          className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Fim (seg)</label>
                        <input 
                          type="number" 
                          min="0"
                          value={overlays[activeOverlayIdx].endTime}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setOverlays(prev => prev.map((o, i) => i === activeOverlayIdx ? { ...o, endTime: val } : o));
                            setPreviewTime(Math.max(0, val - 0.5));
                          }}
                          className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
                        />
                      </div>
                    </div>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Preview & Output */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Player / Canvas Container */}
            <div className="rounded-2xl overflow-hidden bg-black/60 backdrop-blur-xl aspect-video border border-white/10 relative flex flex-col justify-center items-center shadow-2xl z-10 group">
              
              {!isPlaying && !recordedVideoUrl && previewTime === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10 pointer-events-none">
                   <div className="w-16 h-16 bg-white/10 backdrop-blur-xl border border-white/30 rounded-full flex items-center justify-center mb-4 cursor-pointer hover:bg-white/20 transition-colors pointer-events-auto" onClick={togglePlayback}>
                     <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent ml-2"></div>
                   </div>
                   <p className="text-gray-300 text-sm font-medium tracking-wide">Preview Window</p>
                </div>
              )}

              {/* Status overlays */}
              {isRecording && (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-red-500/20 text-red-500 px-3 py-1.5 rounded-full backdrop-blur-md border border-red-500/30 text-xs font-bold leading-none tracking-wider uppercase">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  Gravando Exportação
                </div>
              )}

              {/* Main rendering canvas */}
              <canvas 
                ref={canvasRef} 
                width={1280} 
                height={720} 
                className="w-full h-full object-contain"
              />

              {/* Timeline Preview Slider when NOT playing */}
              {!isPlaying && !isRecording && (
                <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/80 to-transparent z-30">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-300 font-mono w-8 text-right">{formatTime(previewTime)}</span>
                    <input 
                      type="range"
                      min="0"
                      max={totalAudioDuration > 0 ? totalAudioDuration : 100}
                      step="0.1"
                      value={previewTime}
                      onChange={(e) => {
                         const time = Number(e.target.value);
                         setPreviewTime(time);
                         drawFrame(time);
                      }}
                      className="flex-1 accent-purple-500 h-1 bg-white/20 rounded-full appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] text-gray-300 font-mono w-8">{formatTime(totalAudioDuration)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="bg-white/5 backdrop-blur-lg p-4 rounded-2xl border border-white/10 shadow-xl flex flex-wrap items-center justify-between gap-4 z-10 relative">
              
              <div className="flex gap-2">
                <button 
                  onClick={togglePlayback}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    isPlaying 
                      ? 'bg-white text-purple-700 hover:bg-gray-100' 
                      : 'bg-gradient-to-tr from-purple-500 to-blue-500 text-white hover:opacity-90 shadow-lg shadow-purple-900/20'
                  }`}
                >
                  {isPlaying ? (
                     <><Square className="w-4 h-4 fill-current" /> Parar</>
                  ) : (
                     <><Play className="w-4 h-4 fill-current" /> Auto-Editar</>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-3">
                
                {/* Format Selector */}
                {!isRecording && (
                  <div className="flex bg-black/50 border border-white/10 rounded-lg p-1 hidden sm:flex items-center">
                    <button 
                      onClick={() => setExportFormat('webm')}
                      className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-bold transition-all ${exportFormat === 'webm' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
                    >WebM</button>
                    <button 
                      onClick={() => setExportFormat('mp4')}
                      className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-bold transition-all ${exportFormat === 'mp4' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400 hover:text-white'}`}
                      title="MP4 pode não ser suportado em todos os navegadores (ex: Chrome)."
                    >MP4</button>
                  </div>
                )}
                
                {/* Recording controls */}
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={isPlaying || videos.length === 0 || audios.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                    title={`Exportar como vídeo ${exportFormat.toUpperCase()}. O vídeo será gravado em tempo real.`}
                  >
                    <Camera className="w-4 h-4" /> Gravar Arquivo
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 animate-pulse"
                  >
                    <StopCircle className="w-4 h-4" /> Parar e Baixar
                  </button>
                )}
                
                {(!recordedVideoUrl || isRecording) ? (
                  <button 
                    disabled
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed hidden sm:flex"
                    title="Grave um vídeo para poder baixar"
                  >
                    <Download className="w-4 h-4" /> Baixar Vídeo
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <a 
                      href={recordedVideoUrl} 
                      download={`autoclip-mv-export.${recordedFormat}`}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:scale-[1.02]"
                    >
                      <Download className="w-4 h-4" /> Baixar (. {recordedFormat})
                    </a>
                    <button
                      onClick={handleExportToDrive}
                      disabled={exportingToDrive}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-[#4285F4]/20 border border-[#4285F4]/50 text-[#4285F4] hover:bg-[#4285F4] hover:text-white"
                    >
                      {exportingToDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                      Salvar no Drive
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      </main>

      {/* Google Drive Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
             <button onClick={() => setShowDriveModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                <X className="w-6 h-6" />
             </button>
             <div className="flex items-center gap-3 mb-6">
                <Cloud className="w-6 h-6 text-[#4285F4]" />
                <h2 className="text-xl font-bold">Importar do Google Drive</h2>
             </div>
             
             {!googleDriveToken ? (
                <div className="text-center py-8">
                   <p className="text-gray-400 mb-6 text-sm">Conecte sua conta do Google Drive para acessar seus áudios e vídeos.</p>
                   <button 
                     onClick={connectGoogleDrive}
                     className="bg-[#4285F4] hover:bg-[#3367D6] text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-3 mx-auto"
                   >
                     <Cloud className="w-5 h-5" /> Conectar Google Drive
                   </button>
                </div>
             ) : (
                <div className="h-96 flex flex-col">
                   <div className="flex justify-between items-center mb-4">
                     <p className="text-sm font-medium text-gray-300">Seus Arquivos de Mídia</p>
                     <button onClick={fetchDriveFiles} className="text-xs text-[#4285F4] hover:underline flex items-center gap-1">
                       Atualizar
                     </button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto custom-scrollbar border border-white/5 rounded-xl bg-black/20 p-2 space-y-2">
                     {driveLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                           <Loader2 className="w-8 h-8 animate-spin mb-2" />
                           <p className="text-xs">Carregando permissões / arquivos...</p>
                        </div>
                     ) : driveFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                           <p className="text-sm text-center px-4">Nenhum vídeo ou áudio encontrado.</p>
                           <p className="text-xs mt-2 text-center">Somente arquivos dos quais este app tem acesso aparecerão aqui.</p>
                        </div>
                     ) : (
                        driveFiles.map(file => (
                          <div key={file.id} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-colors cursor-pointer group" onClick={() => handleDriveFileSelect(file)}>
                             <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 bg-white/5 rounded flex bg-cover bg-center items-center justify-center flex-shrink-0" style={{ backgroundImage: file.thumbnailLink ? `url(${file.thumbnailLink})` : undefined }}>
                                   {!file.thumbnailLink && (file.mimeType.includes('video') ? <Film className="w-5 h-5 text-gray-400" /> : <Music className="w-5 h-5 text-gray-400" />)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium truncate w-48 text-gray-200 group-hover:text-white">{file.name}</p>
                                  <p className="text-[10px] text-gray-500 uppercase">{file.mimeType.split('/')[0]}</p>
                                </div>
                             </div>
                             <button className="px-3 py-1 bg-[#4285F4]/20 text-[#4285F4] text-xs font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity">Importar</button>
                          </div>
                        ))
                     )}
                   </div>
                </div>
             )}
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}} />
    </div>
  );
}
