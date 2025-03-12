  // ************* Service worker *************
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateNotification();
          }
        };
      };
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
        showUpdateNotification();
      }
    });
  }

  function showUpdateNotification() {
    const updateBanner = document.createElement('div');
    updateBanner.innerHTML = `
      <div class="notification_container">
        <p class="notification_message">A new version is available!!</p>
        <button onclick="updateApp()">Update</button>
      </div>
    `;
    document.body.appendChild(updateBanner);
  }

  function updateApp() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
    }
    window.location.reload();
  }

  // ************* Main function *************
  function onReady() {
    const inputImage = document.getElementById('inputImage');
    const cameraButton = document.getElementById('icon_camera');
    const startButton = document.getElementById('startButton');
    const canvasArea = document.getElementById('canvas_area');
    const resultArea = document.getElementById('result_area');
    let src = null;
    let myChart = null;

    cameraButton.addEventListener('click', handleCameraButtonClick);
    inputImage.addEventListener('change', handleImageChange);
    startButton.addEventListener('click', handleStartButtonClick);

    // カメラアイコンをクリックした時の処理
    function handleCameraButtonClick() {
      if (cameraButton.classList.contains('default')) {
        cameraButton.classList.remove('default');
      }
      resultArea.style.display = "none"; // 既存の結果をクリア
      clearAllCanvas();
      destroyPreviousChart();
      inputImage.click();  // inputタグに連携
    }

    function clearAllCanvas() {
      ['canvasOriginal', 'canvasRipe', 'canvasUnripe', 'canvasOverripe', 'canvasAll'].forEach(clearCanvas);
    }

    function destroyPreviousChart() {
      if (myChart) {
        myChart.destroy();
        myChart = null;
      }
    }

    function handleImageChange(event) {
      startButton.disabled = true;
      canvasArea.style.display = "block";

      const file = event.target.files[0];
      if (!file) {
        alert('No file selected');
        return;
      }

      const img = new Image();
      img.onload = () => processImage(img);

      if (file.type === 'image/heic' || file.name.endsWith('.heic')) {
        convertHeicToPng(file, img);
      } else {
        img.src = URL.createObjectURL(file);
      }
    }

    // heic形式の画像の時の変換処理
    function convertHeicToPng(file, img) {
      console.log('Converting HEIC to PNG...');
      heic2any({ blob: file, toType: 'image/png' })
        .then((convertedBlob) => img.src = URL.createObjectURL(convertedBlob))
        .catch((error) => {
          console.error('Failed to convert HEIC:', error);
          alert('Failed to process HEIC file. Please try a different file format.');
        });
    }

    // オリジナル画像を描画する処理
    function processImage(img) {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');

      // 画像サイズを半分にリサイズ
      const resizedWidth = Math.floor(img.width / 2);
      const resizedHeight = Math.floor(img.height / 2);
      tempCanvas.width = resizedWidth;
      tempCanvas.height = resizedHeight;

      // リサイズして描画
      ctx.drawImage(img, 0, 0, resizedWidth, resizedHeight);
      const originalCanvas = document.getElementById('canvasOriginal');
      const originalCtx = originalCanvas.getContext('2d');
      originalCanvas.width = resizedWidth;
      originalCanvas.height = resizedHeight;
      originalCtx.drawImage(tempCanvas, 0, 0);

      // 影と背景を除去したマスクを準備
      src = cv.imread(tempCanvas);
      window.imgLab = new cv.Mat();
      cv.cvtColor(src, window.imgLab, cv.COLOR_BGR2Lab);
      window.adjustedMask = applyAdjustedMask(window.imgLab);

      // Startボタンを有効化
      startButton.disabled = false;
    }

    // Startボタンを押した時の処理
    async function handleStartButtonClick() {
      if (!src || !window.imgLab || !window.adjustedMask) {
        alert('No image data available');
        return;
      }

      // 処理中にローディングページを表示
      const loadingPage = document.getElementById('loading_page');
      loadingPage.classList.add('loadeding');
      // 画像処理の非同期化
      await new Promise(resolve => setTimeout(resolve, 0));
      await performImageProcessing();

      loadingPage.classList.remove('loadeding');
      canvasArea.style.display = "none"; // 計算前の画像を非表示
      resultArea.style.display = "block"; // 結果の表示
      startButton.disabled = true; // Startボタンを無効化
    }

    async function performImageProcessing() {
      const masks = calculateMasks();
      const ratios = calculateRatios(masks);
      updateResults(ratios);
      renderChart(ratios);
      drawAllMasks(masks);
      releaseResources(Object.values(masks));
    }

    function calculateMasks() {
      const thresholds = getThresholds(window.imgLab);
      const masks = createMasks(thresholds);
      combineMasks(masks);
      return masks;
    }

    function createMasks(thresholds) {
      return {
        ripeMask: applyMask(thresholds.ripeLower, thresholds.ripeUpper),
        unripeGreenMask: applyMask(thresholds.unripeGreenLower, thresholds.unripeGreenUpper),
        unripeYellowMask: applyMask(thresholds.unripeYellowLower, thresholds.unripeYellowUpper),
        unripeOrangeMask: applyMask(thresholds.unripeOrangeLower, thresholds.unripeOrangeUpper),
        overripeMask: applyMask(thresholds.overripeLower, thresholds.overripeUpper),
        unripeMask: new cv.Mat() // placeholder for combined unripe mask
      };
    }

    function combineMasks(masks) {
      // cv.bitwise_or(masks.unripeGreenMask, masks.unripeYellowMask, masks.unripeMask);
      let tempMask = new cv.Mat();

      // unripeGreenMask と unripeYellowMask を結合
      cv.bitwise_or(masks.unripeGreenMask, masks.unripeYellowMask, tempMask);

      // さらに unripeOrangeMask を結合
      cv.bitwise_or(tempMask, masks.unripeOrangeMask, masks.unripeMask);

      tempMask.delete();
    }

    // 割合を計算する処理
    function calculateRatios(masks) {
      const pixelCounts = {
        ripe: cv.countNonZero(masks.ripeMask),
        unripe: cv.countNonZero(masks.unripeMask),
        overripe: cv.countNonZero(masks.overripeMask),
      };
      const total = pixelCounts.ripe + pixelCounts.unripe + pixelCounts.overripe;
      return {
        // 割合は少数点以下は切り捨て
        ripe: Math.floor((pixelCounts.ripe / total) * 100),
        unripe: Math.floor((pixelCounts.unripe / total) * 100),
        overripe: Math.floor((pixelCounts.overripe / total) * 100),
      };
    }

    // 計算した割合をテーブルに記述する処理
    function updateResults(ratios) {
      document.getElementById('ripeRatio').textContent = `${ratios.ripe}%`;
      document.getElementById('unripeRatio').textContent = `${ratios.unripe}%`;
      document.getElementById('overripeRatio').textContent = `${ratios.overripe}%`;
    }

    // Chartの設定
    function renderChart(ratios) {
      const ctx = document.getElementById("piechart").getContext("2d");
      myChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ['Ripe', 'Unripe', 'Overripe'],
          datasets: [{
            data: [ratios.ripe, ratios.unripe, ratios.overripe],
            backgroundColor: ['#900606', '#F1BE06', '#3A0203'],
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          tooltips: { enabled: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              reverse: true,
              labels: { font: { size: 14 }, color: '#032962' }
            }
          },
        },
        plugins: [ // グラフの中央にテキストを表示
          {
            id: 'ratio-text',
            beforeDraw(chart) {
              const { ctx, chartArea: { top, width, height } } = chart;
              ctx.save();
              ctx.font = 'bold 30px Roboto';
              ctx.fillStyle = '#900606';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const ripePercentage = parseFloat(ratios.ripe).toFixed(0) + ' %';
              ctx.fillText(ripePercentage, width / 2, top + (height / 2));
            }
          }
        ]
      });
    }

    function drawAllMasks(masks) {
      drawMaskedImage('canvasRipe', masks.ripeMask, src);
      drawMaskedImage('canvasUnripe', masks.unripeMask, src);
      drawMaskedImage('canvasOverripe', masks.overripeMask, src);
      drawMaskedImage('canvasAll', window.adjustedMask, src);
    }

    // 明度と背景の調整行うマスク
    function applyAdjustedMask(imgLab) {

      // 明るさ（L*）の範囲指定
      const lowerL = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [20, 0, 0, 0]); // *LowerBoundは手動で定義
      const upperL = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 255, 255, 0]);

      // L* に基づくマスク作成（影の除去）
      const lightnessMask = new cv.Mat();
      cv.inRange(imgLab, lowerL, upperL, lightnessMask);

      // 取り除く白背景の範囲を指定（中央値は128）
      const LowerW = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [0, 120, 120, 0]); //中央値から-8
      const UpperW = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 145, 145, 0]); // 中央値から+17

      // 白色領域のマスク作成
      const whiteMask = new cv.Mat();
      cv.inRange(imgLab, LowerW, UpperW, whiteMask);

      // マスクを反転（白背景以外を残す）
      const nonWhiteMask = new cv.Mat();
      cv.bitwise_not(whiteMask, nonWhiteMask);

      // 明度調整用マスクと背景削除用マスクを統合
      const adjustedMask = new cv.Mat();
      cv.bitwise_and(lightnessMask, nonWhiteMask, adjustedMask);

      // 不要なリソースを解放
      releaseResources([lowerL, upperL, LowerW, UpperW, lightnessMask, whiteMask, nonWhiteMask]);

      // 影＋白背景が除去されたマスク
      return adjustedMask;
    }

    function applyMask(lower, upper) {
      const mask = new cv.Mat();
      cv.inRange(window.imgLab, lower, upper, mask);
      cv.bitwise_and(mask, window.adjustedMask, mask);
      return mask;
    }

    // マスクを重ねた画像を描画する処理
    function drawMaskedImage(canvasId, mask, originalImage) {
      const maskedImage = originalImage.clone();
      for (let y = 0; y < maskedImage.rows; y++) {
        for (let x = 0; x < maskedImage.cols; x++) {
          if (mask.ucharAt(y, x) === 0) {
            maskedImage.ucharPtr(y, x).set([255, 255, 255]);
          }
        }
      }
      const canvas = document.getElementById(canvasId);
      if (canvas) {
        cv.imshow(canvas, maskedImage);
      } else {
        console.warn(`Canvas with id '${canvasId}' not found.`);
      }
      maskedImage.delete();
    }

    // Canvasの画像をクリアする処理
    function clearCanvas(canvasId) {
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // メモリを解放する処理
    function releaseResources(mats) {
      mats.forEach(mat => mat.delete());
    }

    // 各マスクの色の閾値の設定
    function convertToOpenCVLab() {

      // OpenCVのデータ型に揃えるための正規化
      function convertPixel(pixel) {
        return [
          pixel[0] * 255 / 100, // L チャンネルの正規化 (0-100 → 0-255)
          pixel[1] + 128,       // a* チャンネルの正規化 (-128–127 → 0–255)
          pixel[2] + 128        // b* チャンネルの正規化 (-128–127 → 0–255)
        ];
      }

      // *********** 熟度に応じた閾値を定義 ***********
      return {
        ripeLower: convertPixel([0, 26, -128]),
        ripeUpper: convertPixel([100, 127, 0]),
        unripeGreenLower: convertPixel([0, -128, 0]),
        unripeGreenUpper: convertPixel([100, -12, 127]),
        unripeYellowLower: convertPixel([0, -12, 10]),
        unripeYellowUpper: convertPixel([100, 26, 20]),
        unripeOrangeLower: convertPixel([0, -18, -128]),
        unripeOrangeUpper: convertPixel([100, 26, -10]),
        overripeLower: convertPixel([0, -12, -10]),
        overripeUpper: convertPixel([100, 26, 10]),
      };
      // ******************************************
    }

    function getThresholds(imgLab) {
      const normalizedThresholds = convertToOpenCVLab();
      return {
        ripeLower: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.ripeLower, 0]),
        ripeUpper: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.ripeUpper, 0]),
        unripeGreenLower: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.unripeGreenLower, 0]),
        unripeGreenUpper: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.unripeGreenUpper, 0]),
        unripeYellowLower: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.unripeYellowLower, 0]),
        unripeYellowUpper: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.unripeYellowUpper, 0]),
        unripeOrangeLower: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.unripeOrangeLower, 0]),
        unripeOrangeUpper: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.unripeOrangeUpper, 0]),
        overripeLower: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.overripeLower, 0]),
        overripeUpper: new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [...normalizedThresholds.overripeUpper, 0]),
      };
    }

    // Splideの設定
    new Splide('.splide', { rewind: true, pagination: true }).mount();
  }

  window.addEventListener('load', onReady);