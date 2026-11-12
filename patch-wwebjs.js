const fs = require('fs');
const path = require('path');

function patchWWebJS() {
    const utilsPath = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');

    if (!fs.existsSync(utilsPath)) {
        console.log('ℹ️ whatsapp-web.js not found in node_modules, skipping patch.');
        return;
    }

    let content = fs.readFileSync(utilsPath, 'utf8');
    let modified = false;

    // Fix 1: Strip __x_id and id from mediaOptions
    if (!content.includes('delete mediaOptions.__x_id;')) {
        const target1 = 'delete options.sendMediaAsSticker;';
        if (content.includes(target1)) {
            content = content.replace(
                target1,
                'delete options.sendMediaAsSticker;\n            delete mediaOptions.__x_id;\n            delete mediaOptions.id;'
            );
            modified = true;
            console.log('✅ Applied Fix 1: drop __x_id from mediaOptions');
        }
    }

    // Fix 2: Ensure message.__x_id is deleted and message.id is restored to newMsgKey
    if (!content.includes('delete message.__x_id;')) {
        const target2 = '...extraOptions,\n        };';
        if (content.includes(target2)) {
            content = content.replace(
                target2,
                '...extraOptions,\n        };\n        delete message.__x_id;\n        message.id = newMsgKey;'
            );
            modified = true;
            console.log('✅ Applied Fix 2: drop message.__x_id and protect message.id');
        }
    }

    // Fix 3: Handle id._serialized vs id.$1 in newer WhatsApp Web versions
    if (content.includes('.Msg.get(newMsgKey._serialized);')) {
        content = content.replace(
            '.Msg.get(newMsgKey._serialized);',
            '.Msg.get(newMsgKey._serialized || newMsgKey.$1 || newMsgKey);'
        );
        modified = true;
        console.log('✅ Applied Fix 3: add fallback for newMsgKey identifier');
    }

    if (modified) {
        fs.writeFileSync(utilsPath, content, 'utf8');
        console.log('🎉 Successfully patched whatsapp-web.js for media sending compatibility!');
    } else {
        console.log('ℹ️ whatsapp-web.js is already patched.');
    }
}

if (require.main === module) {
    patchWWebJS();
}

module.exports = patchWWebJS;
