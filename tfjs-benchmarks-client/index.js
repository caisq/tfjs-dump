const taskTable = document.getElementById('task-table');

async function run() {
  await firebase.initializeApp({
      authDomain: 'jstensorflow.firebaseapp.com',
      projectId: 'jstensorflow'
  });
  console.log('initializeApp DONE');

  const db = firebase.firestore();

  async function getAllTasks() {
    const query = db.collection('Tasks').where('taskType', '==', 'model');
    query.get().then(querySnapshot => {
      const modelAndFunctions = [];
      querySnapshot.forEach(doc => {
        const data = doc.data();
        modelAndFunctions.push([data.taskName, data.functionName]);
      });
      modelAndFunctions.sort();
      modelAndFunctions.forEach(modelAndFunction => {
        const [modelName, functionName] = modelAndFunction;

        const row = document.createElement('tr');
        const modelCell = document.createElement('td');
        modelCell.textContent = modelName;
        modelCell.attributes['modelName'] = modelName;
        modelCell.attributes['functionName'] = functionName;
        modelCell.addEventListener('click', async event => {
          const {endingTimestampMs, averageTimeMs, environmentTypes} = await getTimingData(
              event.srcElement.attributes['modelName'],
              event.srcElement.attributes['functionName']);
          console.log('endingTimestampMs:',  endingTimestampMs);
          console.log('averageTimeMs:',  averageTimeMs);
          console.log('environmentTypes:', environmentTypes);;
          const dataPython = {x: [], y: [], type: 'scatter', name: 'python-tensorflow-cpu'};
          const dataChromeLinux = {x: [],  y: [], type: 'scatter', name: 'chrome-linux'};
          const endingDateTimes = endingTimestampMs.map(t => new Date(t));
          for (let i = 0; i < endingTimestampMs.length; ++i) {
            if (environmentTypes[i] === 'python-tensorflow-cpu') {
              dataPython.x.push(endingDateTimes[i]);
              dataPython.y.push(averageTimeMs[i]);
            } else if (environmentTypes[i] === 'chrome-linux') {
              dataChromeLinux.x.push(endingDateTimes[i]);
              dataChromeLinux.y.push(averageTimeMs[i]);
            }
          }
          Plotly.newPlot('main-plot', [dataPython, dataChromeLinux]);
        });
        row.appendChild(modelCell);

        const functionCell = document.createElement('td');
        functionCell.textContent = functionName;
        row.appendChild(functionCell);

        taskTable.appendChild(row);
      });
    });
  }
  await getAllTasks();

  let environmentInfoCache;
  async function getEnvironmentInfo(id) {
    if (environmentInfoCache == null) {
      console.log('Getting environment info');  // DEBUG
      const querySnapshot = await db.collection('Environments').get();
      environmentInfoCache = {};
      querySnapshot.forEach(doc => {
        environmentInfoCache[doc.id] = doc.data();
      });
    }
    return environmentInfoCache[id];
  }

  async function getTimingData(modelName, functionName) {
    return new Promise((resolve, reject) => {
      const query = db.collection('BenchmarkRuns')
          .where('modelName', '==', modelName)
          .where('functionName', '==', functionName)
          .orderBy('endingTimestampMs');
      query.get().then(async querySnapshot => {
        const endingTimestampMs = [];
        const averageTimeMs = [];
        const environmentIds = [];
        const environmentTypes = [];
        querySnapshot.forEach(async doc => {
          const data = doc.data();
          endingTimestampMs.push(data.endingTimestampMs);
          averageTimeMs.push(data.averageTimeMs);
          environmentIds.push(data.environmentId);
        });

        for (const environmentId of environmentIds) {
          const environmentInfo = await getEnvironmentInfo(environmentId);
          environmentTypes.push(
              environmentInfo == null ? null : environmentInfo.type);
        }
        console.log('resolving');
        resolve({endingTimestampMs, averageTimeMs, environmentTypes});
      }).catch(error => reject(error));
    });
  }

  // const deleteBatch = db.batch();
  // Read all data in a collection.
  // db.collection('TaskLogs').get().then(querySnapshot => {
  //     querySnapshot.forEach(doc => {
  //         console.log(`${doc.id} => ${JSON.stringify(doc.data())}`);
  //     });
  // });
  // Read data by id.
  // db.collection('test1').doc('1234556y').get().then(doc => {
  //     console.log(`${doc.id} => ${JSON.stringify(doc.data())}`);
  // });

  // Add data.
  // db.collection('test1').add({
  //     "averageRunTimeMs": 1.88,
  //     "modelName": "MobileNetV2",
  //     "modelTaskType": "predict",
  //     "timestamp": new Date().getTime()
  // }).then(docRef => {
  //     console.log(`Added document with id: ${docRef.id}`);
  // });

  // Query.
  // const query = db.collection('BenchmarkRuns')
  //     .where('modelName', '==', 'dense-large')
  //     .where('functionName', '==', 'predict')
  //     .orderBy('endingTimestampMs');
  // query.get().then(querySnapshot => {
  //     console.log('In snapshot', querySnapshot);
  //     querySnapshot.forEach(doc => {
  //         // console.log(`${doc.id} => ${JSON.stringify(doc.data())}`);
  //         const data = doc.data();
  //         console.log(
  //             `taskId=${data.taskId}; ` +
  //             `environmentId=${data.environmentId}; ` +
  //             `versionSetId=${data.versionSetId}; ` +
  //             `modelName=${data.modelName}; ` +
  //             `functionName=${data.functionName}; ` +
  //             `timestamp=${data.endingTimestampMs}; ` +
  //             `averageTimeMs=${data.averageTimeMs.toFixed(3)}`);
  //     });
  // }).catch(error => {
  //     console.log('query get error:', error);
  // });
}
run();