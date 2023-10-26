const axios = require("axios").default;
const DateTime = require("luxon").DateTime;

function convertDateTimeToDateTimeStr(dateTime) {
  // YYYY-MM-DDThh:mm:ssTZD
  let dateStr = dateTime.setZone("Asia/Singapore").toString();
  return dateStr;
}

function convertDateTimeToDateStr(dateTime) {
  // YYYY-MM-DDThh:mm:ssTZD
  let dateStr = convertDateTimeToDateTimeStr(dateTime).substring(0, 10);
  return dateStr;
}

function getCurrDateStr() {
  return convertDateTimeToDateStr(DateTime.now());
}

function getHourFromDateTime(dateTime) {
  const dateTimeStr = convertDateTimeToDateTimeStr(dateTime);
  return Number(dateTimeStr.substring(11, 13));
}

function getPrev7DaysDateStr(currDateTime) {
  const dateStrs = [];
  for (let i = 7; i >= 1; --i) {
    dateStrs.push(convertDateTimeToDateStr(currDateTime.minus({ days: i })));
  }
  return dateStrs;
}

function getHourIndexFromIndexesArr(indexes, hour) {
  const hourValue = indexes.map((index) => {
    const dateTime = DateTime.fromISO(index.timestamp);
    const indexHour = getHourFromDateTime(dateTime);
    return { hour: indexHour, value: index.value };
  });
  return hourValue.reduce((a, b) => {
    // get closest hour to current hour
    const aDiff = Math.abs(a.hour - hour);
    const bDiff = Math.abs(b.hour - hour);
    if (aDiff < bDiff) {
      return a;
    } else {
      return b;
    }
  }).value;
}

function average(arr) {
  return arr.reduce((a, b) => a + b) / arr.length;
}

function roundToTwoDpIfNonInteger(x) {
  if (Number.isInteger(x)) {
    return x;
  } else {
    return Number.parseFloat(x).toFixed(2);
  }
}

async function getNextHourAvg7DayIndex() {
  const currDateTime = DateTime.now().plus({ hours: 1 });
  const dateStrs = getPrev7DaysDateStr(currDateTime);
  const indexes = await Promise.all(
    dateStrs.map(async (dateStr) => {
      const uvResponse = await getUvData(dateStr);
      const index = handleUvResponse((data) => {
        return getHourIndexFromIndexesArr(
          getLatestUvItemFromUvResponse(data).index,
          getHourFromDateTime(currDateTime)
        );
      }, uvResponse);
      return index;
    })
  );
  return roundToTwoDpIfNonInteger(average(indexes));
}

/**
 * @property status - 'healthy' if UV API is healthy
 */
class ApiInfo {
  constructor(status) {
    this.status = status;
  }
}

/**
 * @property timestamp - last index timestamp
 * @property update_timestamp - last update timestamp
 * @property index - array of UvIndex
 */
class UvItem {
  constructor(timestamp, update_timestamp, index) {
    this.timestamp = timestamp;
    this.update_timestamp = update_timestamp;
    this.index = index;
  }
}

/**
 * @property value - UV index value
 * @property timestamp - time of UV
 */
class UvIndex {
  constructor(value, timestamp) {
    this.value = value;
    this.timestamp = timestamp;
  }
}

/**
 * @property api_info - ApiInfo
 * @property items - array of UvItem
 */
class UvResponse {
  constructor(api_info, items) {
    this.api_info = api_info;
    this.items = items;
  }
}

function getLatestUvItemFromUvResponse(uvResponse) {
  // const items = uvResponse.items.sort((a, b) => {
  //   const aDt = DateTime.fromISO(a.timestamp);
  //   const bDt = DateTime.fromISO(b.timestamp);
  //   if (aDt > bDt) {
  //     return -1;
  //   } else if (aDt < bDt) {
  //     return 1;
  //   } else {
  //     return 0;
  //   }
  // });
  // const latestUvItem = items[0];
  const latestUvItem = uvResponse.items[uvResponse.items.length - 1];
  return latestUvItem;
}

async function getUvData(dateStr) {
  const res = await axios.get(
    "https://api.data.gov.sg/v1/environment/uv-index",
    {
      params: {
        date: dateStr,
      },
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  return res.data;
}

function handleUvResponse(fn, data) {
  if (data.api_info.status === "healthy") {
    return fn(data);
  }
  return null;
}

async function main() {
  const uvResponse = await getUvData(getCurrDateStr());
  let result = "";

  const latestUvItem = handleUvResponse(
    getLatestUvItemFromUvResponse,
    uvResponse
  );

  result += "Today's UV so far:";

  latestUvItem.index.reverse().forEach((index) => {
    result += `${getHourFromDateTime(DateTime.fromISO(index.timestamp))}:00 - ${
      index.value
    }`;
  });

  const avgIndex = await getNextHourAvg7DayIndex();

  result += `\nAverage 7 day index for the next hour is: ${avgIndex}`;
  console.log(result);
}

main();
