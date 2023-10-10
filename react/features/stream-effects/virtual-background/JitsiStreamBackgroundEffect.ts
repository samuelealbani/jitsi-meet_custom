import { VIRTUAL_BACKGROUND_TYPE } from '../../virtual-background/constants';
import vision from "@mediapipe/tasks-vision";
const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;
const demosSection = document.getElementById("demos");
const imageBlendShapes = document.getElementById("image-blend-shapes");
const videoBlendShapes = document.getElementById("video-blend-shapes");
import {
    CLEAR_TIMEOUT,
    SET_TIMEOUT,
    TIMEOUT_TICK,
    timerWorkerScript
} from './TimerWorker';

export interface IBackgroundEffectOptions {
    height: number;
    virtualBackground: {
        backgroundType?: string;
        blurValue?: number;
        virtualSource?: string;
    };
    width: number;
}

/**
 * Represents a modified MediaStream that adds effects to video background.
 * <tt>JitsiStreamBackgroundEffect</tt> does the processing of the original
 * video stream.
 */
export default class JitsiStreamBackgroundEffect {
    _model: any;
    _options: IBackgroundEffectOptions;
    _stream: any;
    _segmentationPixelCount: number;
    _inputVideoElement: HTMLVideoElement;
    _maskFrameTimerWorker: Worker;
    _outputCanvasElement: HTMLCanvasElement;
    _outputCanvasCtx: CanvasRenderingContext2D | null;
    _segmentationMaskCtx: CanvasRenderingContext2D | null;
    _segmentationMask: ImageData;
    _segmentationMaskCanvas: HTMLCanvasElement;
    _virtualImage: HTMLImageElement;
    _virtualVideo: HTMLVideoElement;
    faceLandmarker:any;
    enableWebcamButton: boolean;
   // runningMode: string;
    webcamRunning: boolean;
    canvasCtx: CanvasRenderingContext2D;
    lastVideoTime: number;
    results: any;

    /**
     * Represents a modified video MediaStream track.
     *
     * @class
     * @param {Object} model - Meet model.
     * @param {Object} options - Segmentation dimensions.
     */
    constructor(model: Object, options: IBackgroundEffectOptions) {
        this._options = options;

        if (this._options.virtualBackground.backgroundType === VIRTUAL_BACKGROUND_TYPE.IMAGE) {
            this._virtualImage = document.createElement('img');
            this._virtualImage.crossOrigin = 'anonymous';
            this._virtualImage.src = this._options.virtualBackground.virtualSource ?? '';
        }
        this._model = model;
        this._segmentationPixelCount = this._options.width * this._options.height;

        // Bind event handler so it is only bound once for every instance.
        this._onMaskFrameTimer = this._onMaskFrameTimer.bind(this);

        // Workaround for FF issue https://bugzilla.mozilla.org/show_bug.cgi?id=1388974
        this._outputCanvasElement = document.createElement('canvas');
        this._outputCanvasElement.getContext('2d');
        
        this._inputVideoElement = document.createElement('video');
        this.faceLandmarker;
        // this.runningMode = "IMAGE";
        this.enableWebcamButton;
        this.webcamRunning = false;
        this.lastVideoTime = -1;
        this.results = undefined;
    }

    async createFaceLandmarker() {
        const filesetResolver = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
            },
            outputFaceBlendshapes: true,
            runningMode: "VIDEO",
            numFaces: 1
        });
        console.log("end createFaceLandmarker", this.faceLandmarker);
    }

    /**
     * EventHandler onmessage for the maskFrameTimerWorker WebWorker.
     *
     * @private
     * @param {EventHandler} response - The onmessage EventHandler parameter.
     * @returns {void}
     */
    _onMaskFrameTimer(response: { data: { id: number; }; }) {
        if (response.data.id === TIMEOUT_TICK) {
            this._renderMask();
        }
    }

    /**
     * PredictWebcam
     *
     * @returns {void}
     */
    async predictWebcam() {

    }


    /**
     * Represents the run post processing.
     *
     * @returns {void}
     */
    async runPostProcessing() {
        
        // let drawingUtils = new DrawingUtils(this.canvasCtx);
        const track = this._stream.getVideoTracks()[0];
        const { height, width } = track.getSettings() ?? track.getConstraints();
        const { backgroundType } = this._options.virtualBackground;

        if (!this._outputCanvasCtx) {
            return;
        }

        this._outputCanvasElement.height = height;
        this._outputCanvasElement.width = width;
        this._outputCanvasCtx.globalCompositeOperation = 'copy';

        // Draw segmentation mask.

        // Smooth out the edges.
        // this._outputCanvasCtx.filter = backgroundType === VIRTUAL_BACKGROUND_TYPE.IMAGE ? 'blur(4px)' : 'blur(8px)';
        // this._outputCanvasCtx?.drawImage( // @ts-ignore
        //     this._segmentationMaskCanvas,
        //     0,
        //     0,
        //     this._options.width,
        //     this._options.height,
        //     0,
        //     0,
        //     this._inputVideoElement.width,
        //     this._inputVideoElement.height
        // );
        // this._outputCanvasCtx.globalCompositeOperation = 'source-in';
        // this._outputCanvasCtx.filter = 'none';

        // Draw the foreground video.
        // @ts-ignore
        // this._outputCanvasCtx?.drawImage(this._inputVideoElement, 0, 0);

        // Draw the background.
        this._outputCanvasCtx.globalCompositeOperation = 'destination-over';
        // if (backgroundType === VIRTUAL_BACKGROUND_TYPE.IMAGE) {
        //     this._outputCanvasCtx?.drawImage( // @ts-ignore
        //         backgroundType === VIRTUAL_BACKGROUND_TYPE.IMAGE
        //             ? this._virtualImage : this._virtualVideo,
        //         0,
        //         0,
        //         this._outputCanvasElement.width,
        //         this._outputCanvasElement.height
        //     );
        // } else {
        //     this._outputCanvasCtx.filter = `blur(${this._options.virtualBackground.blurValue}px)`;

        //     // @ts-ignore
        //     this._outputCanvasCtx?.drawImage(this._inputVideoElement, 0, 0);
        // }
        const radio = this._inputVideoElement.videoHeight / this._inputVideoElement.videoWidth;
        let startTimeMs = performance.now();
        if (this.lastVideoTime !== this._inputVideoElement.currentTime) {
            this.lastVideoTime = this._inputVideoElement.currentTime;
            this.results = this.faceLandmarker.detectForVideo(this._inputVideoElement, startTimeMs);
        }

        
        const drawingUtils = new DrawingUtils(this._outputCanvasCtx);
        console.log(drawingUtils);
        if (this.results.faceLandmarks) {
            for (const landmarks of this.results.faceLandmarks) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070", lineWidth: 1 });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: "#FF3030" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, { color: "#FF3030" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: "#30FF30" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, { color: "#30FF30" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "#E0E0E0" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: "#E0E0E0" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, { color: "#FF3030" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, { color: "#30FF30" });
            }
        }
        // this.drawBlendShapes(videoBlendShapes, this.results.faceBlendshapes);



    }

    drawBlendShapes(el, blendShapes) {
        if (!blendShapes.length) {
            return;
        }
        console.log(blendShapes[0]);
        let htmlMaker = "";
        blendShapes[0].categories.map((shape) => {
            htmlMaker += `
          <li class="blend-shapes-item">
            <span class="blend-shapes-label">${shape.displayName || shape.categoryName}</span>
            <span class="blend-shapes-value" style="width: calc(${+shape.score * 100}% - 120px)">${(+shape.score).toFixed(4)}</span>
          </li>
        `;
        });
        el.innerHTML = htmlMaker;
    }

    /**
     * Represents the run Tensorflow Interference.
     *
     * @returns {void}
     */
    runInference() {
        this._model._runInference();
        const outputMemoryOffset = this._model._getOutputMemoryOffset() / 4;

        for (let i = 0; i < this._segmentationPixelCount; i++) {
            const person = this._model.HEAPF32[outputMemoryOffset + i];

            // Sets only the alpha component of each pixel.
            this._segmentationMask.data[(i * 4) + 3] = 255 * person;

        }
        this._segmentationMaskCtx?.putImageData(this._segmentationMask, 0, 0);
    }

    /**
     * Loop function to render the background mask.
     *
     * @private
     * @returns {void}
     */
    async _renderMask() {
        this.resizeSource();
        this.runInference();
        await this.runPostProcessing();

        this._maskFrameTimerWorker.postMessage({
            id: SET_TIMEOUT,
            timeMs: 1000 / 30
        });
    }

    /**
     * Represents the resize source process.
     *
     * @returns {void}
     */
    resizeSource() {
        this._segmentationMaskCtx?.drawImage( // @ts-ignore
            this._inputVideoElement,
            0,
            0,
            this._inputVideoElement.width,
            this._inputVideoElement.height,
            0,
            0,
            this._options.width,
            this._options.height
        );

        const imageData = this._segmentationMaskCtx?.getImageData(
            0,
            0,
            this._options.width,
            this._options.height
        );
        const inputMemoryOffset = this._model._getInputMemoryOffset() / 4;

        for (let i = 0; i < this._segmentationPixelCount; i++) {
            this._model.HEAPF32[inputMemoryOffset + (i * 3)] = Number(imageData?.data[i * 4]) / 255;
            this._model.HEAPF32[inputMemoryOffset + (i * 3) + 1] = Number(imageData?.data[(i * 4) + 1]) / 255;
            this._model.HEAPF32[inputMemoryOffset + (i * 3) + 2] = Number(imageData?.data[(i * 4) + 2]) / 255;
        }
    }

    /**
     * Checks if the local track supports this effect.
     *
     * @param {JitsiLocalTrack} jitsiLocalTrack - Track to apply effect.
     * @returns {boolean} - Returns true if this effect can run on the specified track
     * false otherwise.
     */
    isEnabled(jitsiLocalTrack: any) {
        return jitsiLocalTrack.isVideoTrack() && jitsiLocalTrack.videoType === 'camera';
    }

    /**
     * Starts loop to capture video frame and render the segmentation mask.
     *
     * @param {MediaStream} stream - Stream to be used for processing.
     * @returns {MediaStream} - The stream with the applied effect.
     */
    startEffect(stream: MediaStream) {
        this._stream = stream;
        this._maskFrameTimerWorker = new Worker(timerWorkerScript, { name: 'Blur effect worker' });
        this._maskFrameTimerWorker.onmessage = this._onMaskFrameTimer;
        const firstVideoTrack = this._stream.getVideoTracks()[0];
        const { height, frameRate, width }
            = firstVideoTrack.getSettings ? firstVideoTrack.getSettings() : firstVideoTrack.getConstraints();

        this._segmentationMask = new ImageData(this._options.width, this._options.height);
        this._segmentationMaskCanvas = document.createElement('canvas');
        this._segmentationMaskCanvas.width = this._options.width;
        this._segmentationMaskCanvas.height = this._options.height;
        this._segmentationMaskCtx = this._segmentationMaskCanvas.getContext('2d');

        this._outputCanvasElement.width = parseInt(width, 10);
        this._outputCanvasElement.height = parseInt(height, 10);
        this._outputCanvasCtx = this._outputCanvasElement.getContext('2d');
        this._inputVideoElement.width = parseInt(width, 10);
        this._inputVideoElement.height = parseInt(height, 10);
        this._inputVideoElement.autoplay = true;
        this._inputVideoElement.srcObject = this._stream;
        this._inputVideoElement.onloadeddata = () => {
            this._maskFrameTimerWorker.postMessage({
                id: SET_TIMEOUT,
                timeMs: 1000 / 30
            });
        };

        return this._outputCanvasElement.captureStream(parseInt(frameRate, 10));
    }

    /**
     * Stops the capture and render loop.
     *
     * @returns {void}
     */
    stopEffect() {
        this._maskFrameTimerWorker.postMessage({
            id: CLEAR_TIMEOUT
        });

        this._maskFrameTimerWorker.terminate();
    }
}
