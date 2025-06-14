require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 }
});

const app = express();
const PORT = process.env.PORT || 7004;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://stargate_v33_user:rwo54ni9sbepti8iKN5924NqGOIieXMb@dpg-d16nfn0dl3ps739jre0g-a.oregon-postgres.render.com/stargate_v33',
  ssl: {
    rejectUnauthorized: false
  }
});

// ===== ADD THE TEST ROUTE HERE =====
app.get('/test-db', async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW() AS current_time');
      res.json({ success: true, time: result.rows[0].current_time });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  // ==================================

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to PostgreSQL:', err.stack);
  }
  console.log('Connected to PostgreSQL database!');
  release();
});

// Update job status
app.post('/api/update-job-status', async (req, res) => {
    let client;
    try {
        const { jobNumber, newStatus, handler_id, notes } = req.body;
        
        if (!jobNumber || !newStatus) {
            return res.status(400).json({
                success: false,
                message: 'Job number and status are required'
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Check if plates are already checked
        if (newStatus !== 'Ready for Press') {
            const { rows } = await client.query(
                'SELECT plates_checked FROM jobs WHERE job_number = $1',
                [jobNumber]
            );
            
            if (rows[0]?.plates_checked) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change status after plates are Ready for Press'
                });
            }
        }

        // Status update mapping
        const statusUpdateMap = {
            'Financially Approved': { table: 'jobs', field: 'financial_approval', value: true },
            'Technically Approved': { table: 'jobs', field: 'technical_approval', value: true },
            'Working on Job-Study': { table: 'jobs', field: 'working_on_job_study', value: true },
            'Working on softcopy': { table: 'jobs', field: 'working_on_softcopy', value: true },
            'Need SC Approval': { 
                table: 'prepress_data', 
                field: 'sc_sent_to_sales', 
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'working_on_softcopy', value: false }
                ]
            },
            'SC Under QC Check': { table: 'jobs', field: 'sc_sent_to_qc', value: true },
            'SC Checked': { 
                table: 'qc_data', 
                field: 'sc_checked', 
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'sc_checked', value: true },
                    { table: 'jobs', field: 'sc_sent_to_qc', value: false }
                ]
            },
            'Working on Cromalin': { 
                table: 'prepress_data', 
                field: 'working_on_cromalin', 
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'working_on_cromalin', value: true }
                ]
            },
            'Need Cromalin Approval': { 
                table: 'prepress_data', 
                field: 'cromalin_ready', 
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'cromalin_ready', value: true }
                ]
            },
            'Working on Repro': { 
                table: 'prepress_data', 
                field: 'working_on_repro', 
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'working_on_repro', value: true }
                ]
            },
            'Prepress Received Plates': { 
                table: 'prepress_data', 
                field: 'plates_received',
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'plates_received', value: true }
                ]
            },
            'QC Received Plates': { 
                table: 'qc_data',
                field: 'plates_received',
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'plates_received', value: true }
                ]
            },
            'Ready for Press': { 
                table: 'qc_data',
                field: 'plates_checked',
                value: true,
                additionalUpdates: [
                    { table: 'jobs', field: 'plates_checked', value: true },
                    { table: 'jobs', field: 'sc_checked', value: false },
                    { table: 'jobs', field: 'plates_received', value: false }
                ]
            }
        };

        const updateInfo = statusUpdateMap[newStatus];
        if (updateInfo) {
            const { table, field, value, additionalUpdates } = updateInfo;
            
            // Check if record exists
            const { rows } = await client.query(
                `SELECT 1 FROM ${table} WHERE job_number = $1`,
                [jobNumber]
            );
            
            if (rows.length === 0 && table !== 'jobs') {
                await client.query(
                    `INSERT INTO ${table} (job_number, ${field}) VALUES ($1, $2)`,
                    [jobNumber, value]
                );
            } else {
                await client.query(
                    `UPDATE ${table} SET ${field} = $1 WHERE job_number = $2`,
                    [value, jobNumber]
                );
            }
            
            if (additionalUpdates) {
                for (const update of additionalUpdates) {
                    await client.query(
                        `UPDATE ${update.table} SET ${update.field} = $1 WHERE job_number = $2`,
                        [update.value, jobNumber]
                    );
                }
            }
        }

        // Record in history
        const { rows: statusType } = await client.query(
            'SELECT id FROM status_types WHERE display_name = $1 OR status_name = $1',
            [newStatus]
        );
        
        if (statusType.length > 0) {
            await client.query(
                `INSERT INTO job_status_history 
                 (job_number, status_type_id, user_id, notes) 
                 VALUES ($1, $2, $3, $4)`,
                [jobNumber, statusType[0].id, handler_id || null, notes || null]
            );
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Status updated successfully'
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Status update error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update status'
        });
    } finally {
        if (client) client.release();
    }
});

// Generate job number
async function generateJobNumber(pool, entryDate, pressType) {
    const year = entryDate.getFullYear();
    const baseYearCode = String.fromCharCode(65 + (year - 2024));
    
    let yearCode = baseYearCode;
    if (pressType && pressType.toLowerCase().includes('stack')) {
        yearCode = baseYearCode.toLowerCase();
    }
    
    const month = entryDate.getMonth() + 1;
    let monthCode = month <= 9 ? month.toString() : 
                   month === 10 ? 'O' : 
                   month === 11 ? 'N' : 'D';
    
    const day = entryDate.getDate().toString().padStart(2, '0');
    const dateStr = entryDate.toISOString().split('T')[0];
    
    const { rows } = await pool.query(
        `SELECT job_number FROM jobs 
         WHERE DATE(created_at) = $1 
         AND LOWER(job_number) LIKE $2 
         ORDER BY job_number DESC LIMIT 1`,
        [dateStr, `${yearCode.toLowerCase()}${monthCode}${day}%`]
    );
    
    let sequence = '01';
    if (rows.length > 0 && rows[0].job_number) {
        const lastSeq = parseInt(rows[0].job_number.slice(-2));
        sequence = (lastSeq + 1).toString().padStart(2, '0');
        
        if (sequence === '100') {
            throw new Error("Maximum daily job limit (99) reached");
        }
    }
    
    return yearCode + monthCode + day + sequence;
}

// Save sales data
app.post('/api/save-sales-data', async (req, res) => {
    let client;
    let jobNumber;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Handle customer
        const { rows: customerRows } = await client.query(
            'SELECT id FROM customers WHERE customer_name = $1 AND customer_code = $2',
            [req.body.customer_name, req.body.customer_code]
        );

        let customerId;
        if (customerRows.length > 0) {
            customerId = customerRows[0].id;
        } else {
            const { rows } = await client.query(
                'INSERT INTO customers (customer_name, customer_code) VALUES ($1, $2) RETURNING id',
                [req.body.customer_name, req.body.customer_code]
            );
            customerId = rows[0].id;
        }

        // Handle job (update or create)
        const isUpdate = req.body.job_number && req.body.job_number.trim() !== '';
        if (isUpdate) {
            await client.query(
                `UPDATE jobs SET
                    customer_id = $1, salesman = $2, job_name = $3,
                    quantity = $4, quantity_unit = $5, product_type = $6,
                    width = $7, height = $8, gusset = $9, flap = $10,
                    press_type = $11, print_orientation = $12, unwinding_direction = $13,
                    financial_approval = $14, technical_approval = $15, on_hold = $16,
                    comments = $17, two_faces = $18, side_gusset = $19,
                    bottom_gusset = $20, hole_handle = $21, strip_handle = $22,
                    flip_direction = $23, updated_at = NOW()
                WHERE job_number = $24`,
                [
                    customerId, req.body.salesman, req.body.job_name,
                    req.body.quantity ? parseFloat(req.body.quantity) : null,
                    req.body.quantity_unit || null, req.body.product_type || null,
                    req.body.width ? parseFloat(req.body.width) : null,
                    req.body.height ? parseFloat(req.body.height) : null,
                    req.body.gusset ? parseFloat(req.body.gusset) : null,
                    req.body.flap ? parseFloat(req.body.flap) : null,
                    req.body.press_type || null, req.body.print_orientation || null,
                    req.body.unwinding_direction || null,
                    req.body.financial_approval || false,
                    req.body.technical_approval || false,
                    req.body.on_hold || false, req.body.comments || null,
                    req.body.two_faces || false, req.body.side_gusset || false,
                    req.body.bottom_gusset || false, req.body.hole_handle || false,
                    req.body.strip_handle || false, req.body.flip_direction || false,
                    req.body.job_number
                ]
            );
            jobNumber = req.body.job_number;
        } else {
            jobNumber = await generateJobNumber(
                pool,
                new Date(req.body.entry_date),
                req.body.press_type
            );

            await client.query(
                `INSERT INTO jobs (
                    customer_id, salesman, entry_date, job_number, job_name,
                    quantity, quantity_unit, product_type, width, height,
                    gusset, flap, press_type, print_orientation,
                    unwinding_direction, financial_approval,
                    technical_approval, on_hold, comments,
                    two_faces, side_gusset, bottom_gusset,
                    hole_handle, strip_handle, flip_direction
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
                [
                    customerId, req.body.salesman || null, req.body.entry_date || null,
                    jobNumber, req.body.job_name || null,
                    req.body.quantity ? parseFloat(req.body.quantity) : null,
                    req.body.quantity_unit || null, req.body.product_type || null,
                    req.body.width ? parseFloat(req.body.width) : null,
                    req.body.height ? parseFloat(req.body.height) : null,
                    req.body.gusset ? parseFloat(req.body.gusset) : null,
                    req.body.flap ? parseFloat(req.body.flap) : null,
                    req.body.press_type || null, req.body.print_orientation || null,
                    req.body.unwinding_direction || null,
                    req.body.financial_approval || false,
                    req.body.technical_approval || false,
                    req.body.on_hold || false, req.body.comments || null,
                    req.body.two_faces || false, req.body.side_gusset || false,
                    req.body.bottom_gusset || false, req.body.hole_handle || false,
                    req.body.strip_handle || false, req.body.flip_direction || false
                ]
            );
        }

        // Handle PLY data
        if (req.body.plies && Array.isArray(req.body.plies)) {
            await client.query(
                'DELETE FROM job_plies WHERE job_number = $1',
                [jobNumber]
            );

            if (req.body.plies.length > 0) {
                for (const ply of req.body.plies) {
                    await client.query(
                        `INSERT INTO job_plies 
                        (job_number, position, material, finish, thickness) 
                        VALUES ($1, $2, $3, $4, $5)`,
                        [
                            jobNumber,
                            req.body.plies.indexOf(ply) + 1,
                            ply.material || null,
                            ply.finish || null,
                            ply.thickness ? parseFloat(ply.thickness) : null
                        ]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: isUpdate ? 'Job updated successfully' : 'Job created successfully',
            jobNumber: jobNumber
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Save error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to save job data'
        });
    } finally {
        if (client) client.release();
    }
});

// Get all customers
app.get('/api/customers', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, customer_name, customer_code FROM customers ORDER BY customer_name'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get all jobs
app.get('/api/all-jobs', async (req, res) => {
    try {
        const searchTerm = req.query.search || '';
        const statusFilter = req.query.status || '';
        
        let query = `
            SELECT 
                j.job_number, j.job_name, j.salesman, j.press_type, j.product_type,
                c.customer_name, TO_CHAR(j.created_at, 'DD-Mon-YYYY HH24:MI:SS') as created_date,
                j.financial_approval, j.technical_approval, j.on_hold,
                j.sc_sent_to_sales, j.sc_sent_to_qc, j.working_on_cromalin,
                j.cromalin_qc_check, j.cromalin_ready, j.working_on_repro,
                j.plates_ready, j.sc_checked, j.cromalin_checked,
                j.plates_received, j.plates_checked,
                (
                    SELECT MAX(status_date) 
                    FROM job_status_history jsh 
                    JOIN status_types st ON jsh.status_type_id = st.id
                    WHERE jsh.job_number = j.job_number AND st.status_name = 'on_hold'
                ) as on_hold_date,
                CASE
                    WHEN j.plates_checked = true THEN 'Ready for Press'
                    WHEN q.plates_received = true THEN 'QC Received Plates'
                    WHEN j.plates_received = true THEN 'Prepress Received Plates'
                    WHEN j.working_on_repro = true THEN 'Working on Repro'
                    WHEN j.cromalin_ready = true THEN 'Need Cromalin Approval'
                    WHEN j.cromalin_qc_check = true THEN 'Cromalin Under QC Check'
                    WHEN j.working_on_cromalin = true THEN 'Working on Cromalin'
                    WHEN j.sc_checked = true THEN 
                        CASE 
                            WHEN j.press_type = 'Central Drum' THEN 'SC Checked, Need Cromalin'
                            WHEN j.press_type = 'Stack Type' THEN 'SC Checked, Need Plates'
                            ELSE 'SC Checked'
                        END
                    WHEN j.sc_sent_to_qc = true THEN 'SC Under QC Check'
                    WHEN j.sc_sent_to_sales = true THEN 'Need SC Approval'
                    WHEN j.working_on_softcopy = true THEN 'Working on softcopy'
                    WHEN j.financial_approval = true AND j.technical_approval = true THEN 'Working on Job-Study'
                    WHEN j.on_hold = true THEN 'On Hold'
                    WHEN j.technical_approval = true THEN 'Technically Approved'
                    WHEN j.financial_approval = true THEN 'Financially Approved'
                    ELSE 'Under Review'
                END as status
            FROM jobs j
            JOIN customers c ON j.customer_id = c.id
            LEFT JOIN qc_data q ON j.job_number = q.job_number
        `;
        
        const conditions = [];
        const params = [];
        
        if (searchTerm) {
            conditions.push(`(j.job_number LIKE $${params.length + 1} OR 
                            j.job_name LIKE $${params.length + 2} OR 
                            c.customer_name LIKE $${params.length + 3} OR 
                            j.salesman LIKE $${params.length + 4})`);
            params.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
        }
        
        if (statusFilter) {
            conditions.push(`CASE
                WHEN j.plates_checked = true THEN 'Ready for Press'
                WHEN q.plates_received = true THEN 'QC Received Plates'
                WHEN j.plates_received = true THEN 'Prepress Received Plates'
                WHEN j.working_on_repro = true THEN 'Working on Repro'
                WHEN j.cromalin_ready = true THEN 'Need Cromalin Approval'
                WHEN j.cromalin_qc_check = true THEN 'Cromalin Under QC Check'
                WHEN j.working_on_cromalin = true THEN 'Working on Cromalin'
                WHEN j.sc_checked = true THEN 'SC Checked'
                WHEN j.sc_sent_to_qc = true THEN 'SC Under QC Check'
                WHEN j.sc_sent_to_sales = true THEN 'Need SC Approval'
                WHEN j.financial_approval = true AND j.technical_approval = true THEN 'Working on Job-Study'
                WHEN j.on_hold = true THEN 'On Hold'
                WHEN j.technical_approval = true THEN 'Technically Approved'
                WHEN j.financial_approval = true THEN 'Financially Approved'
                ELSE 'Under Review'
            END = $${params.length + 1}`);
            params.push(statusFilter);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY j.created_at DESC';
        
        const { rows: jobs } = await pool.query(query, params);
        
        const processedJobs = jobs.map(job => {
            if (job.status === 'On Hold' && job.on_hold_date) {
                const formattedDate = new Date(job.on_hold_date).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                job.status = `On Hold Since ${formattedDate}`;
            }
            return job;
        });
        
        res.json(processedJobs);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// Get job details
app.get('/api/jobs/:jobNumber', async (req, res) => {
    try {
        const { rows: jobRows } = await pool.query(`
            SELECT 
                j.*,
                c.customer_name,
                c.customer_code,
                TO_CHAR(j.entry_date, 'YYYY-MM-DD') as formatted_entry_date
            FROM jobs j
            JOIN customers c ON j.customer_id = c.id
            WHERE j.job_number = $1
        `, [req.params.jobNumber]);

        if (jobRows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Job not found'
            });
        }

        const job = jobRows[0];
        
        // Get PLY data
        const { rows: plies } = await pool.query(`
            SELECT 
                id, job_number, position, material, finish,
                thickness::text as thickness
            FROM job_plies 
            WHERE job_number = $1
            ORDER BY position
        `, [req.params.jobNumber]);

        // Parse bag_options if exists
        let bagOptions = {};
        try {
            bagOptions = job.bag_options ? JSON.parse(job.bag_options) : {};
        } catch (e) {
            console.error('Error parsing bag_options:', e);
        }
        
        // Create merged options
        const mergedOptions = {
            twoFaces: job.two_faces !== undefined ? job.two_faces : bagOptions.twoFaces,
            sideGusset: job.side_gusset !== undefined ? job.side_gusset : bagOptions.sideGusset,
            bottomGusset: job.bottom_gusset !== undefined ? job.bottom_gusset : bagOptions.bottomGusset,
            holeHandle: job.hole_handle !== undefined ? job.hole_handle : bagOptions.holeHandle,
            stripHandle: job.strip_handle !== undefined ? job.strip_handle : bagOptions.stripHandle,
            flipDirection: job.flip_direction !== undefined ? job.flip_direction : bagOptions.flipDirection
        };

        // Format response
        const responseData = {
            ...job,
            bag_options: mergedOptions,
            plies: plies.map(ply => ({
                ...ply,
                thickness: ply.thickness ? parseFloat(ply.thickness) : null
            })) || []
        };

        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job details'
        });
    }
});

// Get planning data
app.get('/api/planning-data/:jobNumber', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                p.*,
                j.product_type, j.width, j.height, j.gusset, j.flap,
                j.two_faces, j.side_gusset, j.bottom_gusset,
                j.hole_handle, j.strip_handle, j.flip_direction,
                p.flip_direction as planning_flip_direction,
                p.add_lines, p.new_machine, p.add_stagger
            FROM planning_data p
            JOIN jobs j ON p.job_number = j.job_number
            WHERE p.job_number = $1
        `, [req.params.jobNumber]);
        
        if (rows.length === 0) {
            return res.json({
                success: true,
                data: null
            });
        }
        
        const planningData = rows[0];
        const responseData = {
            machine: planningData.machine,
            horizontal_count: planningData.horizontal_count,
            vertical_count: planningData.vertical_count,
            flip_direction: planningData.planning_flip_direction || planningData.flip_direction,
            add_lines: planningData.add_lines,
            new_machine: planningData.new_machine,
            add_stagger: planningData.add_stagger,
            comments: planningData.comments,
            product_type: planningData.product_type,
            two_faces: planningData.two_faces,
            side_gusset: planningData.side_gusset,
            bottom_gusset: planningData.bottom_gusset,
            hole_handle: planningData.hole_handle,
            strip_handle: planningData.strip_handle,
            width: planningData.width,
            height: planningData.height,
            gusset: planningData.gusset,
            flap: planningData.flap
        };
        
        res.json({
            success: true,
            data: responseData
        });
    } catch (error) {
        console.error('Error fetching planning data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch planning data'
        });
    }
});

// Get prepress data
app.get('/api/prepress-data/:jobNumber', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                pd.*,
                u.full_name AS handler_name,
                u.full_name AS handler_full_name
            FROM prepress_data pd
            LEFT JOIN users u ON pd.handler_id = u.id
            WHERE pd.job_number = $1
        `, [req.params.jobNumber]);
        
        if (rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    colors: []
                }
            });
        }
        
        // Get colors
        const { rows: colors } = await pool.query(`
            SELECT color_name AS name 
            FROM prepress_colors 
            WHERE job_number = $1
            ORDER BY position
        `, [req.params.jobNumber]);
        
        res.json({
            success: true,
            data: {
                ...rows[0],
                colors: colors || []
            }
        });
    } catch (error) {
        console.error('Error fetching prepress data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch prepress data'
        });
    }
});

// Get QC data
app.get('/api/qc-data/:jobNumber', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM qc_data WHERE job_number = $1',
            [req.params.jobNumber]
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                data: null
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching QC data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch QC data'
        });
    }
});

// Save planning data
app.post('/api/save-planning-data', async (req, res) => {
    let client;
    try {
        const { jobNumber, ...data } = req.body;
        
        if (!jobNumber) {
            return res.status(400).json({
                success: false,
                message: 'Job number is required'
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Check if exists
        const { rows: existing } = await client.query(
            'SELECT id FROM planning_data WHERE job_number = $1',
            [jobNumber]
        );

        if (existing.length > 0) {
            // Update
            await client.query(
                `UPDATE planning_data SET
                    machine = $1, horizontal_count = $2, vertical_count = $3,
                    flip_direction = $4, add_lines = $5, new_machine = $6,
                    add_stagger = $7, comments = $8, updated_at = NOW()
                WHERE job_number = $9`,
                [
                    data.machine, data.horizontalCount, data.verticalCount,
                    data.flipDirection || false, data.addLines || false,
                    data.newMachine || false, data.addStagger || false,
                    data.comments, jobNumber
                ]
            );
        } else {
            // Insert
            await client.query(
                `INSERT INTO planning_data (
                    job_number, machine, horizontal_count, vertical_count,
                    flip_direction, add_lines, new_machine, add_stagger, comments
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    jobNumber, data.machine, data.horizontalCount, data.verticalCount,
                    data.flipDirection || false, data.addLines || false,
                    data.newMachine || false, data.addStagger || false, data.comments
                ]
            );
        }

        // Update job status
        await client.query(
            `UPDATE jobs SET 
                working_on_softcopy = true,
                updated_at = NOW()
             WHERE job_number = $1`,
            [jobNumber]
        );

        // Record status change
        const { rows: statusType } = await client.query(
            'SELECT id FROM status_types WHERE display_name = $1',
            ['Working on softcopy']
        );
        
        if (statusType.length > 0) {
            await client.query(
                `INSERT INTO job_status_history 
                 (job_number, status_type_id, user_id, notes) 
                 VALUES ($1, $2, $3, $4)`,
                [jobNumber, statusType[0].id, req.body.handler_id || null, 'Planning data saved']
            );
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Planning data saved successfully'
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Save planning error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to save planning data'
        });
    } finally {
        if (client) client.release();
    }
});

// Upload SC image
app.post('/api/upload-sc-image', upload.single('scImage'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        const jobNumber = req.body.jobNumber;
        if (!jobNumber) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, message: 'Job number is required' });
        }

        // Move file
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const newFilename = `sc-approval-${jobNumber}-${Date.now()}${path.extname(req.file.originalname)}`;
        const newPath = path.join(uploadDir, newFilename);
        fs.renameSync(req.file.path, newPath);

        // Update database
        const { rows: existing } = await pool.query(
            'SELECT id FROM prepress_data WHERE job_number = $1', 
            [jobNumber]
        );

        if (existing.length > 0) {
            await pool.query(
                'UPDATE prepress_data SET sc_image_url = $1 WHERE job_number = $2',
                [`/uploads/${newFilename}`, jobNumber]
            );
        } else {
            await pool.query(
                'INSERT INTO prepress_data (job_number, sc_image_url) VALUES ($1, $2)',
                [jobNumber, `/uploads/${newFilename}`]
            );
        }

        res.json({ 
            success: true, 
            imageUrl: `/uploads/${newFilename}` 
        });
    } catch (error) {
        console.error('Upload error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ 
            success: false, 
            message: 'Failed to upload image' 
        });
    }
});

// Get user ID
app.get('/api/get-user-id', async (req, res) => {
    const username = req.query.username;
    if (!username) return res.json({ userId: null, fullName: null });
    
    try {
        const { rows } = await pool.query(
            'SELECT id, full_name FROM users WHERE username = $1', 
            [username]
        );
        
        if (rows.length > 0) {
            res.json({ userId: rows[0].id, fullName: rows[0].full_name });
        } else {
            res.json({ userId: null, fullName: null });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.json({ userId: null, fullName: null });
    }
});

// Save prepress data
const recentPrepressRequests = new Set();

app.post('/api/save-prepress-data', async (req, res) => {
    const { jobNumber, colors = [], requestId, handler_id, handler_name, ...data } = req.body;
    
    // Check duplicate
    if (requestId && recentPrepressRequests.has(requestId)) {
        console.log(`Duplicate request ${requestId} for job ${jobNumber} ignored`);
        return res.status(200).json({
            success: true,
            message: 'Duplicate request ignored',
            duplicate: true
        });
    }
    
    if (requestId) {
        recentPrepressRequests.add(requestId);
        setTimeout(() => recentPrepressRequests.delete(requestId), 5000);
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Verify job exists
        const { rows: jobExists } = await client.query(
            'SELECT id FROM jobs WHERE job_number = $1',
            [jobNumber]
        );

        if (jobExists.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Always set sc_sent_to_sales to true
        const scSentToSales = true;

        // Check if prepress data exists
        const { rows: existing } = await client.query(
            'SELECT id FROM prepress_data WHERE job_number = $1',
            [jobNumber]
        );

        if (existing.length > 0) {
            // Update existing
            await client.query(
                `UPDATE prepress_data SET
                    supplier = $1, sc_sent_to_sales = $2, sc_sent_to_qc = $3,
                    working_on_cromalin = $4, cromalin_qc_check = $5,
                    cromalin_ready = $6, working_on_repro = $7,
                    plates_received = $8, comments = $9, sc_image_url = $10,
                    handler_id = $11, updated_at = NOW()
                WHERE job_number = $12`,
                [
                    data.supplier || null, scSentToSales, data.sc_sent_to_qc || false,
                    data.working_on_cromalin || false, data.cromalin_qc_check || false,
                    data.cromalin_ready || false, data.working_on_repro || false,
                    data.plates_received || false, data.comments || null,
                    data.sc_image_url || null, handler_id || null, jobNumber
                ]
            );
        } else {
            // Insert new
            await client.query(
                `INSERT INTO prepress_data (
                    job_number, supplier, sc_sent_to_sales, sc_sent_to_qc,
                    working_on_cromalin, cromalin_qc_check, cromalin_ready,
                    working_on_repro, plates_received, comments, sc_image_url,
                    handler_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    jobNumber, data.supplier || null, scSentToSales,
                    data.sc_sent_to_qc || false, data.working_on_cromalin || false,
                    data.cromalin_qc_check || false, data.cromalin_ready || false,
                    data.working_on_repro || false, data.plates_received || false,
                    data.comments || null, data.sc_image_url || null, handler_id || null
                ]
            );
        }

        // Update jobs table
        await client.query(
            `UPDATE jobs SET 
                sc_sent_to_sales = $1,
                working_on_softcopy = false,
                updated_at = NOW()
             WHERE job_number = $2`,
            [scSentToSales, jobNumber]
        );

        // Handle colors - delete existing first
        await client.query(
            'DELETE FROM prepress_colors WHERE job_number = $1',
            [jobNumber]
        );

        // Insert new colors
        if (colors.length > 0) {
            for (const color of colors.filter(c => c && c.name)) {
                await client.query(
                    'INSERT INTO prepress_colors (job_number, color_name, color_code, position) VALUES ($1, $2, $3, $4)',
                    [
                        jobNumber,
                        color.name.substring(0, 50),
                        color.code || '#000000',
                        colors.indexOf(color)
                    ]
                );
            }
        }

        // Record status change
        const { rows: statusType } = await client.query(
            'SELECT id FROM status_types WHERE status_name = $1',
            ['sc_sent_to_sales']
        );
        
        if (statusType.length > 0) {
            await client.query(
                `INSERT INTO job_status_history 
                 (job_number, status_type_id, user_id, notes) 
                 VALUES ($1, $2, $3, $4)`,
                [jobNumber, statusType[0].id, handler_id || null, 'Status updated to Need SC Approval']
            );
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Prepress data saved successfully. Status updated to "Need SC Approval"',
            colorsSaved: colors.length,
            newStatus: 'Need SC Approval'
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Save prepress error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to save prepress data'
        });
    } finally {
        if (client) client.release();
    }
});

// Save QC data
app.post('/api/save-qc-data', async (req, res) => {
    let client;
    try {
        const { jobNumber, scChecked, cromalinChecked, platesReceived, platesChecked, comments } = req.body;
        
        if (!jobNumber) {
            return res.status(400).json({
                success: false,
                message: 'Job number is required'
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Check if exists
        const { rows: existing } = await client.query(
            'SELECT id FROM qc_data WHERE job_number = $1',
            [jobNumber]
        );

        if (existing.length > 0) {
            // Update
            await client.query(
                `UPDATE qc_data SET
                    sc_checked = $1, cromalin_checked = $2,
                    plates_received = $3, plates_checked = $4,
                    comments = $5, updated_at = NOW()
                WHERE job_number = $6`,
                [scChecked, cromalinChecked, platesReceived, platesChecked, comments, jobNumber]
            );
        } else {
            // Insert
            await client.query(
                `INSERT INTO qc_data (
                    job_number, sc_checked, cromalin_checked,
                    plates_received, plates_checked, comments
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [jobNumber, scChecked, cromalinChecked, platesReceived, platesChecked, comments]
            );
        }

        // Update jobs table
        await client.query(
            `UPDATE jobs SET 
                sc_checked = $1,
                updated_at = NOW()
             WHERE job_number = $2`,
            [scChecked, jobNumber]
        );

        // Record status if SC checked
        if (scChecked) {
            const { rows: statusType } = await client.query(
                'SELECT id FROM status_types WHERE status_name = $1',
                ['sc_checked']
            );
            
            if (statusType.length > 0) {
                await client.query(
                    `INSERT INTO job_status_history 
                     (job_number, status_type_id, user_id, notes) 
                     VALUES ($1, $2, $3, $4)`,
                    [jobNumber, statusType[0].id, req.body.handler_id || null, comments || 'SC Checked by QC']
                );
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'QC data saved successfully'
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Save QC error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to save QC data'
        });
    } finally {
        if (client) client.release();
    }
});

// Get job status history
app.get('/api/job-status-history/:jobNumber', async (req, res) => {
    try {
        const { rows: history } = await pool.query(`
            SELECT 
                st.display_name as status,
                jsh.status_date,
                u.username as updated_by,
                jsh.notes
            FROM job_status_history jsh
            JOIN status_types st ON jsh.status_type_id = st.id
            LEFT JOIN users u ON jsh.user_id = u.id
            WHERE jsh.job_number = $1
            ORDER BY jsh.status_date DESC
        `, [req.params.jobNumber]);
        
        res.json(history);
    } catch (error) {
        console.error('Error fetching status history:', error);
        res.status(500).json({ error: 'Failed to fetch status history' });
    }
});

// Delete job
app.delete('/api/jobs/:jobNumber', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Delete dependent records
        await client.query('DELETE FROM job_status_history WHERE job_number = $1', [req.params.jobNumber]);
        await client.query('DELETE FROM job_plies WHERE job_number = $1', [req.params.jobNumber]);
        await client.query('DELETE FROM planning_data WHERE job_number = $1', [req.params.jobNumber]);
        await client.query('DELETE FROM prepress_data WHERE job_number = $1', [req.params.jobNumber]);
        await client.query('DELETE FROM prepress_colors WHERE job_number = $1', [req.params.jobNumber]);
        await client.query('DELETE FROM qc_data WHERE job_number = $1', [req.params.jobNumber]);

        // Delete main job record
        const { rowCount } = await client.query(
            'DELETE FROM jobs WHERE job_number = $1',
            [req.params.jobNumber]
        );

        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                message: `Job ${req.params.jobNumber} not found`
            });
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: `Job deleted successfully`,
            deletedJobNumber: req.params.jobNumber
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete job',
            errorCode: error.code
        });
    } finally {
        if (client) client.release();
    }
});

// Add this route to handle root URL requests
app.get('/', (req, res) => {
  res.send('StarGate Backend is Running!');
});

// Your existing test route
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({ success: true, time: result.rows[0].current_time });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;