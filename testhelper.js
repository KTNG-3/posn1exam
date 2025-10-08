const fs = require("fs-extra");
const path = require("node:path");
const AdmZip = require("adm-zip");
const readline = require('readline/promises');
const puppeteer = require("puppeteer");

/**
 * Kawin Kaewnern
 * https://github.com/KTNG-3/posn1exam
 */

const baseUrl = "http://172.168.0.11:8889";
const loginUrl = "http://172.168.0.11:8889";
const taskAddUrl = "http://172.168.0.11:8889/tasks/add";

async function createWebTask (user, pass, task_name, file_path, test_count) {
    const browser = await puppeteer.launch({
        headless: true
    });

    const page = (await browser.pages())[0];

    await page.goto(loginUrl);
    await page.waitForNetworkIdle();

    console.log("Try to login");

    await page.type('input[name="username"]', user, { delay: 15 });
    await page.type('input[name="password"]', pass, { delay: 20 });
    await page.click('button[type="submit"]', { delay: 100 });
    await page.waitForNetworkIdle();

    console.log("Try to add task: " + task_name);

    await page.goto(taskAddUrl);
    await page.waitForNetworkIdle();

    const submitCreateButtons = await page.$$('input[type="submit"]');

    await page.type('input[name="name"]', task_name, { delay: 15 });
    await submitCreateButtons[1].click();
    await page.waitForNetworkIdle();

    const taskUrl = page.url();
    if (taskUrl.includes("/tasks/add"))
    {
        console.log("Fail");
        return;
    }

    console.log("Collecting task info: " + taskUrl);

    let taskStatementRedirect = null;
    let taskTastcaseRedirect = null;

    const allHref = await page.$$("a");
    for (let a of allHref)
    {
        const href = await page.evaluate(el => el.getAttribute("href"), a);
        if (href == null || href.trim() == "") continue;

        if (href.includes("add_multiple"))
        {
            taskTastcaseRedirect = href;
        }

        if (href.includes("statements/add"))
        {
            taskStatementRedirect = href;
        }
    }

    console.log("Try to change task settings: " + taskUrl);

    const allText = await page.$$("input[type=text]");
    for (let input of allText)
    {
        const name = await page.evaluate(el => el.getAttribute("name"), input);
        if (name == null || name.trim() == "") continue;

        if (name.includes("time_limit"))
        {
            console.log("-> change time limits");

            await input.evaluate(el => el.value = 5);
        }

        if (name.includes("memory_limit"))
        {
            console.log("-> memory limits");

            await input.evaluate(el => el.value = 128);
        }
    }

    const allTextArea = await page.$$("textarea");
    for (let textarea of allTextArea)
    {
        const name = await page.evaluate(el => el.getAttribute("name"), textarea);
        if (name == null || name.trim() == "") continue;

        if (name.includes("score_type_parameters"))
        {
            console.log("-> score calculations");

            let score_per = (100 / test_count).toFixed(5);
            await textarea.evaluate((el, x) => el.value = x, score_per);
        }
    }

    console.log("-> score mode");

    await page.select('select[name=score_mode]', 'max');

    const submitUpdateButtons = await page.$$('input[type="submit"]');
    await submitUpdateButtons[1].click();
    await page.waitForNetworkIdle();

    if (taskStatementRedirect == null || taskTastcaseRedirect == null)
    {
        console.log("Error URL");
        return;
    }

    let taskStatementURL = baseUrl + "/" + taskStatementRedirect.substring(taskStatementRedirect.indexOf('d'));
    let taskTastcaseURL = baseUrl + "/" + taskTastcaseRedirect.substring(taskTastcaseRedirect.indexOf('d'));

    console.log("Try to upload testcase: " + taskTastcaseURL);

    await page.goto(taskTastcaseURL);
    await page.waitForNetworkIdle();

    const fileElement = await page.waitForSelector('input[type=file]');
    await fileElement.uploadFile(file_path);

    const checkbox = await page.waitForSelector('input[type=checkbox]');
    await checkbox.click();

    const submitTestButtons = await page.$$('input[type="submit"]');
    await submitTestButtons[1].click({ delay: 1000 });

    await page.waitForNetworkIdle();
    await browser.close();

    console.log("Successful");
};

function goodName(str) {
    //write by good old friend, ChatGPT5
    //create a nodejs function to transform string
    // "28substrCompare" -> "28 Substr Compare"
    // "substrCompareYaya" -> "Substr Compare Yaya"
    // "substrCompareYAYA" -> "Substr Compare YAYA"
    // "substrSUPERpls" -> "Substr SUPER Pls"
    // "substrSUPERPls" -> "Substr SUPERP Ls"
    // "substr3Compare2YAYA1" -> "Substr 3 Compare 2 YAYA 1"
    // "Damit_Haha-1" -> "Damit Haha 1"
    // "2Da_m3it-Ha-ha_1" -> "2 Da M 3 It Ha Ha 1"

    function splitToken(token) {
        const regex = /([A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+)/g;
        return token.match(regex) || [];
    }

    let temp = str.replace(/[_-]/g, ' ');
    let tokens = temp.split(' ');
    let parts = tokens.flatMap(splitToken);
    let result = parts
        .map(word => {
            if (/^\d+$/.test(word)) return word;
            if (word.toUpperCase() === word) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');

    return result;
}

async function main () {
    let self_this_file_path = process.argv[1];
    let file_path = path.join(__dirname, process.argv[2]);
    let read = await fs.readFile(file_path);
    let data = JSON.parse(read);

    let name = path.parse(data.srcPath).name;
    let write_parent_dir = path.dirname(data.srcPath);
    let temp_dir = path.join(write_parent_dir, "cms_" + name);

    await fs.ensureDirSync(write_parent_dir);

    try
    {
        await fs.rm(temp_dir, { recursive: true });
    }
    catch (_) { }
    
    await fs.mkdir(temp_dir);

    console.log("Creating testcase dir: " + temp_dir);

    const zip = new AdmZip();

    for (let i = 0; i < data.tests.length; i++) {
        let task = data.tests[i];
        let i_name = (i + 1);

        let in_file_path = path.join(temp_dir, "input." + i_name);
        let out_file_path = path.join(temp_dir, "output." + i_name);

        await fs.writeFile(in_file_path, task.input);
        await fs.writeFile(out_file_path, task.output);

        zip.addLocalFile(in_file_path);
        zip.addLocalFile(out_file_path);
    }

    let zip_file = path.join(write_parent_dir, name + ".zip");

    console.log("Creating zip file: " + zip_file);

    try
    {
        await fs.rm(zip_file);
    }
    catch (_) { }

    zip.writeZip(zip_file);

    await fs.rm(temp_dir, { recursive: true });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let q = await rl.question("Type nothing to create a task in web: ");
    rl.close();
    
    if (q.trim() != "")
    {
        return;
    }

    console.log("Try to get user: " + self_this_file_path);

    let self_this_folder_path = path.dirname(self_this_file_path);
    let self_this_user_file_path = path.join(self_this_folder_path, "testhelper.user.json");

    if (!(await fs.exists(self_this_user_file_path)))
    {
        await fs.writeFile(self_this_user_file_path, JSON.stringify({ username: "", password: "" }));

        console.log("please put user at: " + self_this_user_file_path + "\nbefore running again");

        return;
    }

    let self_this_user_read = JSON.parse(await fs.readFile(self_this_user_file_path));

    await createWebTask(self_this_user_read.username, self_this_user_read.password, goodName(name), zip_file, data.tests.length);
};

main();
