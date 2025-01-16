window.onload = () => {

  // Splideのオプション
  new Splide( '.splide', {
    rewind: boolean = true,
  }).mount();
  
  // 割合データを取得
  const ripeRatio = sessionStorage.getItem('ripeRatio') || '-';
  const unripeRatio = sessionStorage.getItem('unripeRatio') || '-';
  const overripeRatio = sessionStorage.getItem('overripeRatio') || '-';

  // テーブルに値を反映
  document.getElementById('ripeRatio').textContent = `${ripeRatio}%`;
  document.getElementById('unripeRatio').textContent = `${unripeRatio}%`;
  document.getElementById('overripeRatio').textContent = `${overripeRatio}%`;

  // 円グラフに描画
  const ctx = document.getElementById("piechart").getContext("2d");
  const myChart = new Chart(ctx, {
    type: "doughnut",// グラフの種類
    data: {
      labels: ['Ripe', 'Unripe','Overripe'],
      datasets: [{
        data: [ripeRatio, unripeRatio, overripeRatio],
        backgroundColor: [
          '#900606',
          '#F1BE06',
          '#3A0203'
        ],
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
          labels: {
            font: {
              size: 14
            },
            color: '#032962'
          }
        },
      }
    },

    // グラフの中央にテキストを表示
    plugins: [{
      id: 'ratio-text',
      beforeDraw(chart) {
        const { ctx, chartArea: { top, width, height } } = chart;
        ctx.save();
        ctx.font = 'bold 30px Roboto';
        ctx.fillStyle = '#900606';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ripePercentage = parseFloat(ripeRatio).toFixed(0) + ' %';
        ctx.fillText(ripePercentage, width / 2, top + (height / 2));
      }
    }]
  });

  // IndexedDBの初期化
  const dbRequest = indexedDB.open('imageDatabase', 1);
  let db;

  dbRequest.onsuccess = (event) => {
    db = event.target.result;

    // IndexedDBからデータを取得してCanvasに描画
    loadAndDrawImage('ripeWebPData', 'canvasRipe');
    loadAndDrawImage('unripeWebPData', 'canvasUnripe');
    loadAndDrawImage('overripeWebPData', 'canvasOverripe');
  };

  dbRequest.onerror = (event) => {
    console.error('Failed to open IndexedDB:', event.target.error);
  };

  // IndexedDBから画像データを取得
  function loadAndDrawImage(imageName, canvasId) {
    if (!db) {
      console.error('IndexedDB is not initialized.');
      return;
    }

    const transaction = db.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    const request = store.get(imageName);

    request.onsuccess = () => {
      const result = request.result;
      if (result && result.data) {
        drawImageToCanvas(result.data, canvasId); // BlobデータをCanvasに描画
      } else {
        console.error(`No data found for ${imageName} in IndexedDB.`);
      }
    };

    request.onerror = (event) => {
      console.error(`Failed to retrieve ${imageName} from IndexedDB:`, event.target.error);
    };
  }

  // WebP画像データをCanvasに描画
  function drawImageToCanvas(imageBlob, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error(`Canvas with id "${canvasId}" not found.`);
      return;
    }

    const ctx = canvas.getContext('2d');
    const image = new Image();

    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
    };

    image.onerror = (err) => {
      console.error(`Failed to load image for canvas ${canvasId}:`, err);
    };

    image.src = URL.createObjectURL(imageBlob); // BlobからURLを生成
  }
};
