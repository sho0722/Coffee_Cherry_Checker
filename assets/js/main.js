/** On Ready */
function onReady() {
  const inputImage = document.getElementById('inputImage');
  const cameraButton = document.getElementById('icon_camera');
  const startButton = document.getElementById('startButton');
  const canvasArea = document.getElementById('canvas_area');
  let src = null;

  // カメラアイコンが押された時の処理
  cameraButton.addEventListener('click', () => {
    cameraButton.classList.remove('default');
    // inputタグにアクセス
    inputImage.click();
  });

  // インプットタグの処理
  inputImage.addEventListener('change', (event) => {
    startButton.disabled = true;
    canvasArea.style.opacity = "1";

    const file = event.target.files[0];
    if (!file) {
      alert('No file selected');
      return;
    }

    const processImage = (img) => {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      src = cv.imread(tempCanvas);
      // オリジナル画像を描画
      // cv.imshow('canvasOriginal', src);

      // 画像をCIELab形式に変換して保持
      window.imgLab = new cv.Mat();
      cv.cvtColor(src, window.imgLab, cv.COLOR_BGR2Lab);

      // 明るさマスクを計算して保持
      window.lightnessMask = applyLightnessMask(window.imgLab);

      // 明るさマスクを適用した画像を描画
      drawMaskedImage('canvasAdjusted', window.lightnessMask, src);

      startButton.disabled = false;
    };

    // データがheic形式のときの処理
    if (file.type === 'image/heic' || file.name.endsWith('.heic')) {
      console.log('Converting HEIC to PNG...');
      heic2any({
        blob: file,
        toType: 'image/png',
      })
        .then((convertedBlob) => {
          const img = new Image();
          img.onload = () => processImage(img);
          img.src = URL.createObjectURL(convertedBlob);
        })
        .catch((error) => {
          console.error('Failed to convert HEIC:', error);
          alert('Failed to process HEIC file. Please try a different file format.');
        });
    } else {
      const img = new Image();
      img.onload = () => processImage(img);
      img.src = URL.createObjectURL(file);
    }
  });

  // IndexedDBの初期化
  const dbRequest = indexedDB.open('imageDatabase', 1);
  let db;

  dbRequest.onupgradeneeded = (event) => {
    db = event.target.result;
    // ObjectStoreを作成
    if (!db.objectStoreNames.contains('images')) {
      db.createObjectStore('images', { keyPath: 'name' });
    }
  };

  dbRequest.onsuccess = (event) => {
    db = event.target.result;
  };

  // Startボタンが押された時の処理
  startButton.addEventListener('click', () => {
    if (!src || !window.imgLab || !window.lightnessMask) {
      alert('No image data available');
      return;
    }

    // ローディング画面を表示
    const loadingPage = document.getElementById('loading_page');
    loadingPage.classList.add('loadeding');

    // ローディング画面を表示を優先するための非同期処理
    setTimeout(() => {
      // 必要なデータを再利用
      const imgLab = window.imgLab;
      const lightnessMask = window.lightnessMask;

      // 各マスクの閾値を定義
      const ripeLower = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [0, 155, 0, 0]);
      const ripeUpper = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 255, 255, 0]);

      const unripeGreenLower = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [0, 0, 0, 0]);
      const unripeGreenUpper = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 110, 255, 0]);

      const unripeYellowLower = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [0, 110, 0, 0]);
      const unripeYellowUpper = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 155, 100, 0]);

      const overripeLower = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [0, 110, 100, 0]);
      const overripeUpper = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 155, 255, 0]);

      // 各マスクを適用
      window.ripeMask = applyMask(imgLab, ripeLower, ripeUpper, lightnessMask);
      window.unripeGreenMask = applyMask(imgLab, unripeGreenLower, unripeGreenUpper, lightnessMask);
      window.unripeYellowMask = applyMask(imgLab, unripeYellowLower, unripeYellowUpper, lightnessMask);
      window.overripeMask = applyMask(imgLab, overripeLower, overripeUpper, lightnessMask);

      // Unripeマスクを統合
      const unripeMask = new cv.Mat();
      cv.bitwise_or(unripeGreenMask, unripeYellowMask, unripeMask);
      window.unripeMask = unripeMask;

      // ピクセルのカウント
      const ripePixels = cv.countNonZero(ripeMask);
      const unripePixels = cv.countNonZero(unripeMask);
      const overripePixels = cv.countNonZero(overripeMask);
      const totalMaskedPixels = ripePixels + unripePixels + overripePixels;

      // 割合の計算
      const ripeRatio = Math.round((ripePixels / totalMaskedPixels) * 100);
      const unripeRatio = Math.round((unripePixels / totalMaskedPixels) * 100);
      const overripeRatio = Math.round((overripePixels / totalMaskedPixels) * 100);

      // Session Storageに割合データを保持
      sessionStorage.setItem('ripeRatio', ripeRatio);
      sessionStorage.setItem('unripeRatio', unripeRatio);
      sessionStorage.setItem('overripeRatio', overripeRatio);

      // IndexedDBから既存のデータを削除して一度空にする処理
      const transaction = db.transaction(['images'], 'readwrite');
      const objectStore = transaction.objectStore('images');
      objectStore.delete('ripeWebPData');
      objectStore.delete('unripeWebPData');
      objectStore.delete('overripeWebPData');

      // マスクを適用して画像生成
      const ripeImageData = applyMaskAndSave(window.ripeMask, src);
      const unripeImageData = applyMaskAndSave(window.unripeMask, src);
      const overripeImageData = applyMaskAndSave(window.overripeMask, src);

      // WebP形式に圧縮して保存する処理
      const saveToDatabasePromises = [
        compressToWebP(ripeImageData).then((ripeWebPBlob) => {
          return saveToIndexedDB('ripeWebPData', ripeWebPBlob);
        }).catch((error) => {
          console.error('Failed to compress ripe image to WebP:', error);
        }),

        compressToWebP(unripeImageData).then((unripeWebPBlob) => {
          return saveToIndexedDB('unripeWebPData', unripeWebPBlob);
        }).catch((error) => {
          console.error('Failed to compress unripe image to WebP:', error);
        }),

        compressToWebP(overripeImageData).then((overripeWebPBlob) => {
          return saveToIndexedDB('overripeWebPData', overripeWebPBlob);
        }).catch((error) => {
          console.error('Failed to compress overripe image to WebP:', error);
        })
      ];

      // すべての保存処理が完了したらページ遷移
      Promise.all(saveToDatabasePromises).then(() => {
        // すべての保存が完了したら遷移
        window.location.href = 'result.html';
      }).catch((error) => {
        console.error('An error occurred while saving data:', error);
      });

      // メモリ解放
      releaseResources([
        ripeLower, ripeUpper, unripeGreenLower, unripeGreenUpper,
        unripeYellowLower, unripeYellowUpper, overripeLower, overripeUpper,
        lightnessMask, imgLab
      ]);
    }, 0); //0ミリ秒でも非同期化される
  });
  

  function applyMaskAndSave(mask, originalImage) {
    // 元の画像を複製
    const maskedImage = originalImage.clone();
  
    // マスクを適用して該当部分以外を白塗り
    for (let y = 0; y < maskedImage.rows; y++) {
      for (let x = 0; x < maskedImage.cols; x++) {
        if (mask.ucharAt(y, x) === 0) {
          // 白塗り（RGBすべて255）
          maskedImage.ucharPtr(y, x).set([255, 255, 255]);
        }
      }
    }
  
    // 画像を`ImageData`形式に変換
    const canvas = document.createElement('canvas');
    canvas.width = maskedImage.cols;
    canvas.height = maskedImage.rows;
    cv.imshow(canvas, maskedImage);
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  
    // メモリ解放
    maskedImage.delete();
  
    return imageData;
  }

  // webpに変換する関数
  function compressToWebP(imageData) {
    // 画像データをCanvasに描画
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 解像度を保持
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);

    // Blobとして取得
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob); // Blob形式で返す
            } else {
                reject(new Error('Failed to convert to WebP Blob.'));
            }
        }, 'image/webp', 1.0); // 1.0は最高品質
    });
  }

  // IndexedDBに保存する関数
  function saveToIndexedDB(name, data) {
    if (!db) {
      console.error('IndexedDB is not initialized.');
      return;
    }

    const transaction = db.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    const request = store.put({ name: name, data: data });

    request.onsuccess = () => {
      console.log(`${name} has been saved to IndexedDB.`);
    };

    request.onerror = (event) => {
      console.error(`Failed to save ${name} to IndexedDB:`, event.target.error);
    };
  }

  // 明度を調整する関数
  function applyLightnessMask(imgLab) {
    let lowerBoundLightness = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [10, 0, 0, 0]);
    let upperBoundLightness = new cv.Mat(imgLab.rows, imgLab.cols, imgLab.type(), [255, 255, 255, 0]);
    let lightnessMask = new cv.Mat();
    cv.inRange(imgLab, lowerBoundLightness, upperBoundLightness, lightnessMask);
    lowerBoundLightness.delete();
    upperBoundLightness.delete();
    return lightnessMask;
  }

  // 熟度に応じたマスク適用する関数
  function applyMask(imgLab, lowerBound, upperBound, lightnessMask) {
    let mask = new cv.Mat();
    cv.inRange(imgLab, lowerBound, upperBound, mask);
    cv.bitwise_and(mask, lightnessMask, mask);
    return mask;
  }

  // マスク当てた画像を描画する関数
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
    cv.imshow(canvas, maskedImage);
    maskedImage.delete();
  }

  // メモリを解放する関数
  function releaseResources(mats) {
    mats.forEach(mat => mat.delete());
  }
}

window.addEventListener('load', () => {
  onReady();
});