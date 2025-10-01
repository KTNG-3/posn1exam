const fs = require("node:fs/promises");
const path = require("node:path");
const AdmZip = require("adm-zip");

async function main () {
    let file_path = path.join(__dirname, process.argv[2]);
    let read = await fs.readFile(file_path);
    let data = JSON.parse(read);

    let name = path.parse(data.srcPath).name;
    let write_parent_dir = path.dirname(data.srcPath);
    let temp_dir = path.join(write_parent_dir, "cms_" + name);

    try
    {
        await fs.rm(temp_dir, { recursive: true });
    }
    catch (_) { }
    
    await fs.mkdir(temp_dir);

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

    try
    {
        await fs.rm(zip_file);
    }
    catch (_) { }

    zip.writeZip(zip_file);

    await fs.rm(temp_dir, { recursive: true });
};

main();