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
          const {
            endingTimestampMs,
            averageTimeMs,
            environmentTypes,
            hostNames
          } = await getTimingData(
              event.srcElement.attributes['modelName'],
              event.srcElement.attributes['functionName']);
          console.log('endingTimestampMs:',  endingTimestampMs);
          console.log('averageTimeMs:',  averageTimeMs);
          console.log('environmentTypes:', environmentTypes);
          console.log('hostNames:', hostNames);

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

  let environmentInfoCache = {};
  async function batchGetEnvironmentInfo(ids) {
    let unknownIds = [];
    ids.forEach(id => {
      if (!(id in environmentInfoCache)) {
        unknownIds.push(id);
      }
    });
    if (unknownIds.length > 0) {
      const collection = db.collection('Environments');
      console.log(`Getting environmentInfo for ${ids.length} ids`);
      const docPromises = ids.map(id => collection.doc(id).get());
      const docs = await Promise.all(docPromises);
      docs.forEach(doc => environmentInfoCache[doc.id] = doc.data());
    }
    return ids.map(id => environmentInfoCache[id]);
  }

  function parseHostName(environmentInfo) {
    if (environmentInfo == null) {
      return null;
    }
    if (environmentInfo.systemInfo == null) {
      return null;
    }
    return environmentInfo.systemInfo.split(' ')[1];
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
        const hostNames = [];
        querySnapshot.forEach(async doc => {
          const data = doc.data();
          endingTimestampMs.push(data.endingTimestampMs);
          averageTimeMs.push(data.averageTimeMs);
          environmentIds.push(data.environmentId);
        });

        const infoItems = await batchGetEnvironmentInfo(environmentIds);
        for (let i = 0; i < environmentIds.length; ++i) {
          const environmentInfo = infoItems[i];
          environmentTypes.push(
              environmentInfo == null ? null : environmentInfo.type);
          hostNames.push(parseHostName(environmentInfo));
        }
        console.log('resolving');
        resolve({
          endingTimestampMs,
          averageTimeMs,
          environmentTypes,
          hostNames
        });
      }).catch(error => reject(error));
    });
  }
}
run();